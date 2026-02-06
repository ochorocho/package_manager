<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Service;

use Ochorocho\PackageManager\Dto\PackageInfo;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use TYPO3\CMS\Core\Cache\Frontend\FrontendInterface;
use TYPO3\CMS\Core\Http\RequestFactory;

/**
 * Service for searching and retrieving packages from Packagist
 *
 * Results are cached to reduce API calls and improve response times.
 */
class PackagistService
{
    private const PACKAGIST_SEARCH_URL = 'https://packagist.org/search.json';
    private const PACKAGIST_PACKAGE_URL = 'https://packagist.org/packages/%s.json';
    private const CACHE_TTL = 3600; // 1 hour
    private const PER_PAGE = 15;

    public function __construct(
        private readonly RequestFactory $requestFactory,
        #[Autowire(service: 'cache.package_manager')]
        private readonly FrontendInterface $cache,
        private readonly LoggerInterface $logger,
    ) {}

    /**
     * Search for packages on Packagist
     *
     * @return array{
     *     packages: list<PackageInfo>,
     *     total: int,
     *     page: int,
     *     perPage: int,
     *     totalPages: int
     * }
     */
    public function search(string $query, int $page = 1): array
    {
        $cacheKey = $this->buildCacheKey('search', $query, (string)$page);

        // Check cache first
        $cached = $this->cache->get($cacheKey);
        if ($cached !== false) {
            return $cached;
        }

        $params = [
            'q' => $query,
            'type' => 'typo3-cms-extension',
            'per_page' => self::PER_PAGE,
            'page' => max(1, $page),
        ];

        $url = self::PACKAGIST_SEARCH_URL . '?' . http_build_query($params);

        try {
            $response = $this->requestFactory->request($url, 'GET', [
                'timeout' => 10,
                'headers' => [
                    'Accept' => 'application/json',
                    'User-Agent' => 'TYPO3-PackageManager/1.0',
                ],
            ]);

            if ($response->getStatusCode() !== 200) {
                $this->logger->warning('Packagist API returned non-200 status', [
                    'status' => $response->getStatusCode(),
                    'url' => $url,
                ]);
                return $this->emptySearchResult($page);
            }

            $body = $response->getBody()->getContents();
            $data = json_decode($body, true);

            if (!is_array($data)) {
                $this->logger->warning('Packagist API returned invalid JSON');
                return $this->emptySearchResult($page);
            }

            $packages = [];
            foreach ($data['results'] ?? [] as $packageData) {
                $packages[] = PackageInfo::fromPackagistSearch($packageData);
            }

            $total = (int)($data['total'] ?? 0);
            $result = [
                'packages' => $packages,
                'total' => $total,
                'page' => $page,
                'perPage' => self::PER_PAGE,
                'totalPages' => (int)ceil($total / self::PER_PAGE),
            ];

            // Cache the result
            $this->cache->set($cacheKey, $result, ['packagist_search'], self::CACHE_TTL);

            return $result;
        } catch (\Throwable $e) {
            $this->logger->error('Packagist API error', [
                'exception' => $e->getMessage(),
                'url' => $url,
            ]);
            return $this->emptySearchResult($page);
        }
    }

    /**
     * Get detailed information about a specific package
     */
    public function getPackageDetails(string $packageName): ?PackageInfo
    {
        $cacheKey = $this->buildCacheKey('package', $packageName);

        // Check cache first
        $cached = $this->cache->get($cacheKey);
        if ($cached !== false) {
            return $cached;
        }

        $url = sprintf(self::PACKAGIST_PACKAGE_URL, $packageName);

        try {
            $response = $this->requestFactory->request($url, 'GET', [
                'timeout' => 10,
                'headers' => [
                    'Accept' => 'application/json',
                    'User-Agent' => 'TYPO3-PackageManager/1.0',
                ],
            ]);

            if ($response->getStatusCode() !== 200) {
                $this->logger->warning('Packagist package API returned non-200 status', [
                    'status' => $response->getStatusCode(),
                    'package' => $packageName,
                ]);
                return null;
            }

            $body = $response->getBody()->getContents();
            $data = json_decode($body, true);

            if (!is_array($data)) {
                $this->logger->warning('Packagist package API returned invalid JSON');
                return null;
            }

            $packageInfo = PackageInfo::fromPackagistDetails($data);

            // Cache the result
            $this->cache->set($cacheKey, $packageInfo, ['packagist_package'], self::CACHE_TTL);

            return $packageInfo;
        } catch (\Throwable $e) {
            $this->logger->error('Packagist package API error', [
                'exception' => $e->getMessage(),
                'package' => $packageName,
            ]);
            return null;
        }
    }

    /**
     * Get suggested packages for a specific package from Packagist
     *
     * Returns suggestions from the latest stable version.
     *
     * @return array<string, string> Package name => description
     */
    public function getPackageSuggestions(string $packageName): array
    {
        $cacheKey = $this->buildCacheKey('suggestions', $packageName);

        // Check cache first
        $cached = $this->cache->get($cacheKey);
        if ($cached !== false) {
            return $cached;
        }

        $url = sprintf(self::PACKAGIST_PACKAGE_URL, $packageName);

        try {
            $response = $this->requestFactory->request($url, 'GET', [
                'timeout' => 10,
                'headers' => [
                    'Accept' => 'application/json',
                    'User-Agent' => 'TYPO3-PackageManager/1.0',
                ],
            ]);

            if ($response->getStatusCode() !== 200) {
                return [];
            }

            $body = $response->getBody()->getContents();
            $data = json_decode($body, true);

            if (!is_array($data)) {
                return [];
            }

            $package = $data['package'] ?? $data;
            $versions = $package['versions'] ?? [];

            // Find suggestions from the first non-dev version
            $suggestions = [];
            foreach ($versions as $versionKey => $versionData) {
                // Skip dev versions
                if (str_starts_with($versionKey, 'dev-')) {
                    continue;
                }
                // Get suggestions from this version
                $suggestions = $versionData['suggest'] ?? [];
                break;
            }

            // Cache the result
            $this->cache->set($cacheKey, $suggestions, ['packagist_suggestions'], self::CACHE_TTL);

            return $suggestions;
        } catch (\Throwable $e) {
            $this->logger->error('Failed to get package suggestions', [
                'exception' => $e->getMessage(),
                'package' => $packageName,
            ]);
            return [];
        }
    }

    /**
     * Get available versions for a package from Packagist
     *
     * Returns version information including PHP and TYPO3 requirements.
     * Limited to the 20 most recent versions.
     *
     * @return array<string, array{version: string, time: string, php: string, typo3: string}>
     */
    public function getPackageVersions(string $packageName): array
    {
        $cacheKey = $this->buildCacheKey('versions', $packageName);

        // Check cache first
        $cached = $this->cache->get($cacheKey);
        if ($cached !== false) {
            return $cached;
        }

        $url = sprintf(self::PACKAGIST_PACKAGE_URL, $packageName);

        try {
            $response = $this->requestFactory->request($url, 'GET', [
                'timeout' => 10,
                'headers' => [
                    'Accept' => 'application/json',
                    'User-Agent' => 'TYPO3-PackageManager/1.0',
                ],
            ]);

            if ($response->getStatusCode() !== 200) {
                return [];
            }

            $body = $response->getBody()->getContents();
            $data = json_decode($body, true);

            if (!is_array($data)) {
                return [];
            }

            $package = $data['package'] ?? $data;
            $rawVersions = $package['versions'] ?? [];

            // Extract relevant version info, limit to latest 20 versions
            $versions = [];
            $count = 0;
            foreach ($rawVersions as $versionKey => $versionData) {
                if ($count >= 20) {
                    break;
                }

                $versions[$versionKey] = [
                    'version' => $versionKey,
                    'time' => $versionData['time'] ?? '',
                    'php' => $versionData['require']['php'] ?? '',
                    'typo3' => $this->extractTypo3Requirement($versionData['require'] ?? []),
                ];
                $count++;
            }

            // Cache the result
            $this->cache->set($cacheKey, $versions, ['packagist_versions'], self::CACHE_TTL);

            return $versions;
        } catch (\Throwable $e) {
            $this->logger->error('Failed to get package versions', [
                'exception' => $e->getMessage(),
                'package' => $packageName,
            ]);
            return [];
        }
    }

    /**
     * Extract TYPO3 Core requirement from require array
     */
    private function extractTypo3Requirement(array $require): string
    {
        foreach ($require as $package => $version) {
            if (str_starts_with($package, 'typo3/cms-core')) {
                return $version;
            }
        }
        return '';
    }

    /**
     * Clear all cached Packagist data
     */
    public function clearCache(): void
    {
        $this->cache->flushByTag('packagist_search');
        $this->cache->flushByTag('packagist_package');
        $this->cache->flushByTag('packagist_versions');
        $this->cache->flushByTag('packagist_suggestions');
    }

    /**
     * Build a cache key for the given parameters
     */
    private function buildCacheKey(string $type, string ...$parts): string
    {
        $key = 'packagist_' . $type . '_' . md5(implode('_', $parts));
        // Cache keys must match /^[a-zA-Z0-9_%\\-&]+$/
        return preg_replace('/[^a-zA-Z0-9_%\\-&]/', '_', $key);
    }

    /**
     * Return an empty search result structure
     *
     * @return array{
     *     packages: list<never>,
     *     total: int,
     *     page: int,
     *     perPage: int,
     *     totalPages: int
     * }
     */
    private function emptySearchResult(int $page): array
    {
        return [
            'packages' => [],
            'total' => 0,
            'page' => $page,
            'perPage' => self::PER_PAGE,
            'totalPages' => 0,
        ];
    }
}
