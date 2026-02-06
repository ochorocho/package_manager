<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Search;

use Ochorocho\PackageManager\Dto\PackageInfo;
use Psr\Log\LoggerInterface;
use TYPO3\CMS\Core\Cache\Frontend\FrontendInterface;
use TYPO3\CMS\Core\Http\RequestFactory;

/**
 * Search provider for Composer-type repositories (Satis, GitLab, Private Packagist)
 *
 * Supports two repository formats:
 * 1. Inline packages: packages.json contains all package data directly in "packages" key
 * 2. Lazy-loading (Composer v2): packages.json has empty "packages" with "provider-includes"
 *    and/or "metadata-url" — used by GitLab Package Registry, Private Packagist, etc.
 *
 * For lazy-loading repos, fetches the provider list to discover package names,
 * then fetches p2/ metadata for each package to get descriptions and versions.
 */
class ComposerRepoSearchProvider implements PackageSearchProviderInterface
{
    private const CACHE_TTL = 3600; // 1 hour

    /**
     * @param array<string, string> $authHeaders HTTP auth headers for this repo's host
     */
    public function __construct(
        private readonly string $name,
        private readonly string $url,
        private readonly RequestFactory $requestFactory,
        private readonly FrontendInterface $cache,
        private readonly LoggerInterface $logger,
        private readonly array $authHeaders = [],
    ) {}

    public function getIdentifier(): string
    {
        return 'composer_' . $this->name;
    }

    public function getLabel(): string
    {
        return $this->name;
    }

    public function search(string $query): array
    {
        $allPackages = $this->getAllPackages();
        if ($allPackages === []) {
            return [];
        }

        $queryLower = mb_strtolower($query);

        return array_values(array_filter(
            $allPackages,
            static fn(PackageInfo $pkg): bool =>
                str_contains(mb_strtolower($pkg->name), $queryLower)
                || str_contains(mb_strtolower($pkg->description), $queryLower),
        ));
    }

    /**
     * Get all packages from this Composer repository (cached)
     *
     * @return list<PackageInfo>
     */
    private function getAllPackages(): array
    {
        $cacheKey = $this->buildCacheKey();

        $cached = $this->cache->get($cacheKey);
        if ($cached !== false) {
            return $cached;
        }

        $packages = $this->fetchPackages();

        $this->cache->set($cacheKey, $packages, ['composer_repo'], self::CACHE_TTL);

        return $packages;
    }

    /**
     * Fetch and parse packages.json from the Composer repository
     *
     * @return list<PackageInfo>
     */
    private function fetchPackages(): array
    {
        $packagesUrl = $this->resolvePackagesJsonUrl();

        try {
            $data = $this->fetchJson($packagesUrl);
            if ($data === null) {
                return [];
            }

            // Try inline packages first (Satis-style)
            $packagesData = $data['packages'] ?? [];
            if (is_array($packagesData) && $packagesData !== []) {
                return $this->parseInlinePackages($packagesData);
            }

            // Lazy-loading: try provider-includes (Composer v1 compat, used by GitLab)
            if (isset($data['provider-includes']) && is_array($data['provider-includes'])) {
                return $this->fetchViaProviderIncludes($data);
            }

            // Lazy-loading: try metadata-url with available-packages list
            if (isset($data['metadata-url']) && isset($data['available-packages']) && is_array($data['available-packages'])) {
                return $this->fetchViaMetadataUrl($data['metadata-url'], $data['available-packages']);
            }

            $this->logger->info('Composer repository has no packages and no provider-includes', [
                'url' => $packagesUrl,
                'repository' => $this->name,
                'keys' => array_keys($data),
            ]);

            return [];
        } catch (\Throwable $e) {
            $this->logger->error('Failed to fetch Composer repository', [
                'exception' => $e->getMessage(),
                'url' => $packagesUrl,
                'repository' => $this->name,
            ]);
            return [];
        }
    }

    /**
     * Parse inline packages from the "packages" key (Satis-style)
     *
     * Format: { "vendor/name": { "version": { ...metadata } } }
     *
     * @return list<PackageInfo>
     */
    private function parseInlinePackages(array $packagesData): array
    {
        $packages = [];
        foreach ($packagesData as $packageName => $versions) {
            if (!is_array($versions)) {
                continue;
            }

            $latestVersion = $this->findLatestStableVersion($versions);
            if ($latestVersion === null) {
                continue;
            }

            if (empty($latestVersion['name'])) {
                $latestVersion['name'] = (string)$packageName;
            }

            $packages[] = PackageInfo::fromComposerRepo($latestVersion, $this->name);
        }

        return $packages;
    }

    /**
     * Fetch packages via provider-includes (Composer v1 / GitLab format)
     *
     * Flow:
     * 1. packages.json has "provider-includes": { "p/%hash%.json": { "sha256": "..." } }
     * 2. Fetch each provider file → get list of package names
     * 3. Use metadata-url (p2/%package%.json) to fetch metadata per package
     *
     * @return list<PackageInfo>
     */
    private function fetchViaProviderIncludes(array $rootData): array
    {
        $baseUrl = $this->resolveBaseUrl();
        $providerIncludes = $rootData['provider-includes'] ?? [];
        $metadataUrl = $rootData['metadata-url'] ?? null;

        // Step 1: Fetch provider files to get all package names
        $packageNames = [];
        foreach ($providerIncludes as $urlTemplate => $hashData) {
            $sha = $hashData['sha256'] ?? '';
            $providerUrl = $baseUrl . '/' . str_replace('%hash%', $sha, $urlTemplate);

            $providerData = $this->fetchJson($providerUrl);
            if ($providerData === null) {
                continue;
            }

            $providers = $providerData['providers'] ?? [];
            if (is_array($providers)) {
                foreach (array_keys($providers) as $name) {
                    $packageNames[] = (string)$name;
                }
            }
        }

        if ($packageNames === []) {
            return [];
        }

        // Step 2: Fetch metadata for each package via metadata-url (p2/)
        if (is_string($metadataUrl)) {
            return $this->fetchPackageMetadata($packageNames, $metadataUrl, $baseUrl);
        }

        // Fallback: return packages with names only (no metadata-url available)
        return $this->buildMinimalPackageInfos($packageNames);
    }

    /**
     * Fetch packages via metadata-url with an available-packages list
     *
     * Some repos provide "available-packages" alongside "metadata-url"
     *
     * @param list<string> $packageNames
     * @return list<PackageInfo>
     */
    private function fetchViaMetadataUrl(string $metadataUrl, array $packageNames): array
    {
        $baseUrl = $this->resolveBaseUrl();
        $names = array_filter($packageNames, 'is_string');

        if ($names === []) {
            return [];
        }

        return $this->fetchPackageMetadata($names, $metadataUrl, $baseUrl);
    }

    /**
     * Fetch p2/ metadata for each package name
     *
     * @param list<string> $packageNames
     * @return list<PackageInfo>
     */
    private function fetchPackageMetadata(array $packageNames, string $metadataUrlTemplate, string $baseUrl): array
    {
        $packages = [];

        foreach ($packageNames as $packageName) {
            // Build the metadata URL: replace %package% placeholder
            $metadataUrl = str_replace('%package%', $packageName, $metadataUrlTemplate);

            // Handle relative URLs
            if (!str_starts_with($metadataUrl, 'http')) {
                $metadataUrl = $baseUrl . '/' . ltrim($metadataUrl, '/');
            }

            $metaData = $this->fetchJson($metadataUrl);
            if ($metaData === null) {
                // Fallback: create a minimal PackageInfo with just the name
                $packages[] = new PackageInfo(
                    name: $packageName,
                    description: '',
                    version: '',
                    type: '',
                    url: '',
                    downloads: 0,
                    favers: 0,
                    source: $this->name,
                );
                continue;
            }

            // p2/ response format: { "packages": { "vendor/name": { "version": {...}, ... } } }
            $pkgVersions = $metaData['packages'][$packageName] ?? [];
            if (!is_array($pkgVersions) || $pkgVersions === []) {
                $packages[] = new PackageInfo(
                    name: $packageName,
                    description: '',
                    version: '',
                    type: '',
                    url: '',
                    downloads: 0,
                    favers: 0,
                    source: $this->name,
                );
                continue;
            }

            $latestVersion = $this->findLatestStableVersion($pkgVersions);
            if ($latestVersion === null) {
                continue;
            }

            if (empty($latestVersion['name'])) {
                $latestVersion['name'] = $packageName;
            }

            $packages[] = PackageInfo::fromComposerRepo($latestVersion, $this->name);
        }

        return $packages;
    }

    /**
     * Build minimal PackageInfo DTOs when only names are available
     *
     * @param list<string> $packageNames
     * @return list<PackageInfo>
     */
    private function buildMinimalPackageInfos(array $packageNames): array
    {
        return array_map(
            fn(string $name): PackageInfo => new PackageInfo(
                name: $name,
                description: '',
                version: '',
                type: '',
                url: '',
                downloads: 0,
                favers: 0,
                source: $this->name,
            ),
            $packageNames,
        );
    }

    /**
     * Find the latest stable version from a versions array
     *
     * @param array<string, mixed> $versions
     * @return array<string, mixed>|null
     */
    private function findLatestStableVersion(array $versions): ?array
    {
        // First pass: find a non-dev version
        foreach ($versions as $versionKey => $versionData) {
            if (!is_array($versionData)) {
                continue;
            }
            $versionString = (string)($versionData['version'] ?? $versionKey);
            if (!str_starts_with($versionString, 'dev-')) {
                return $versionData;
            }
        }

        // Second pass: accept any version (including dev)
        foreach ($versions as $versionData) {
            if (is_array($versionData)) {
                return $versionData;
            }
        }

        return null;
    }

    /**
     * Fetch JSON from a URL with authentication headers
     *
     * @return array<string, mixed>|null
     */
    private function fetchJson(string $url): ?array
    {
        $headers = array_merge([
            'Accept' => 'application/json',
            'User-Agent' => 'TYPO3-PackageManager/1.0',
        ], $this->authHeaders);

        $response = $this->requestFactory->request($url, 'GET', [
            'timeout' => 15,
            'headers' => $headers,
        ]);

        if ($response->getStatusCode() !== 200) {
            $this->logger->warning('Composer repository request returned non-200 status', [
                'status' => $response->getStatusCode(),
                'url' => $url,
                'repository' => $this->name,
            ]);
            return null;
        }

        $body = $response->getBody()->getContents();
        $data = json_decode($body, true);

        if (!is_array($data)) {
            $this->logger->warning('Composer repository returned invalid JSON', [
                'url' => $url,
                'repository' => $this->name,
            ]);
            return null;
        }

        return $data;
    }

    /**
     * Resolve the packages.json URL from the configured repository URL
     *
     * The URL in composer.json may point directly to packages.json
     * or may be a base URL that needs packages.json appended.
     */
    private function resolvePackagesJsonUrl(): string
    {
        $url = rtrim($this->url, '/');

        if (str_ends_with($url, '/packages.json') || str_ends_with($url, '.json')) {
            return $url;
        }

        return $url . '/packages.json';
    }

    /**
     * Resolve the base URL for building provider/metadata URLs
     *
     * Given a configured URL like:
     *   https://source.b13.run/api/v4/group/5/-/packages/composer/packages.json
     * Returns:
     *   https://source.b13.run
     *
     * Provider-includes and metadata-url paths from GitLab are absolute paths
     * starting with /api/v4/..., so we need just the scheme + host.
     */
    private function resolveBaseUrl(): string
    {
        $parsed = parse_url($this->url);
        $scheme = $parsed['scheme'] ?? 'https';
        $host = $parsed['host'] ?? '';
        $port = isset($parsed['port']) ? ':' . $parsed['port'] : '';

        return $scheme . '://' . $host . $port;
    }

    private function buildCacheKey(): string
    {
        $key = 'composer_repo_' . md5($this->name . '_' . $this->url);
        return preg_replace('/[^a-zA-Z0-9_%\\-&]/', '_', $key) ?? $key;
    }
}
