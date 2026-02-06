<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Search;

use Ochorocho\PackageManager\Dto\PackageInfo;
use Psr\Log\LoggerInterface;
use TYPO3\CMS\Core\Cache\Frontend\FrontendInterface;

/**
 * Search provider for path-type repositories
 *
 * Scans local directories matching the path pattern for composer.json files,
 * then filters by the search query. Results are cached with a short TTL
 * since the filesystem can change during development.
 */
class PathRepoSearchProvider implements PackageSearchProviderInterface
{
    private const CACHE_TTL = 300; // 5 minutes

    public function __construct(
        private readonly string $name,
        private readonly string $pathPattern,
        private readonly string $projectPath,
        private readonly FrontendInterface $cache,
        private readonly LoggerInterface $logger,
    ) {}

    public function getIdentifier(): string
    {
        return 'path_' . $this->name;
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
     * Get all packages from this path repository (cached)
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

        $packages = $this->scanPackages();

        $this->cache->set($cacheKey, $packages, ['path_repo'], self::CACHE_TTL);

        return $packages;
    }

    /**
     * Scan the filesystem for composer.json files matching the path pattern
     *
     * @return list<PackageInfo>
     */
    private function scanPackages(): array
    {
        $pattern = $this->projectPath . '/' . rtrim($this->pathPattern, '/');

        // If pattern ends with /*, append /composer.json for globbing
        // e.g. "packages/*" → "packages/*/composer.json"
        if (str_ends_with($pattern, '/*')) {
            $globPattern = substr($pattern, 0, -1) . '*/composer.json';
        } else {
            // Single package path — check for composer.json directly
            $globPattern = rtrim($pattern, '/') . '/composer.json';
        }

        $composerFiles = glob($globPattern);
        if ($composerFiles === false || $composerFiles === []) {
            return [];
        }

        $packages = [];
        foreach ($composerFiles as $composerFile) {
            $content = file_get_contents($composerFile);
            if ($content === false) {
                continue;
            }

            $data = json_decode($content, true);
            if (!is_array($data) || empty($data['name'])) {
                continue;
            }

            $packages[] = PackageInfo::fromLocalComposerJson($data, $this->name);
        }

        return $packages;
    }

    private function buildCacheKey(): string
    {
        $key = 'path_repo_' . md5($this->name . '_' . $this->pathPattern);
        return preg_replace('/[^a-zA-Z0-9_%\\-&]/', '_', $key) ?? $key;
    }
}
