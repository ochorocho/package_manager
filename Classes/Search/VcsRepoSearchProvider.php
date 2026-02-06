<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Search;

use Ochorocho\PackageManager\Dto\PackageInfo;
use Psr\Log\LoggerInterface;
use TYPO3\CMS\Core\Cache\Frontend\FrontendInterface;

/**
 * Search provider for VCS-type repositories
 *
 * Each VCS repository contains exactly one package. The package name
 * is derived from the repository URL. Matches if the query is found
 * in the derived package name.
 */
class VcsRepoSearchProvider implements PackageSearchProviderInterface
{
    private const CACHE_TTL = 3600; // 1 hour

    public function __construct(
        private readonly string $name,
        private readonly string $url,
        private readonly FrontendInterface $cache,
        private readonly LoggerInterface $logger,
    ) {}

    public function getIdentifier(): string
    {
        return 'vcs_' . $this->name;
    }

    public function getLabel(): string
    {
        return $this->name;
    }

    public function search(string $query): array
    {
        $packageName = $this->derivePackageName();
        if ($packageName === '') {
            return [];
        }

        $queryLower = mb_strtolower($query);
        if (!str_contains(mb_strtolower($packageName), $queryLower)) {
            return [];
        }

        return [
            new PackageInfo(
                name: $packageName,
                description: 'VCS repository: ' . $this->url,
                version: 'dev',
                type: '',
                url: $this->url,
                downloads: 0,
                favers: 0,
                source: $this->name,
            ),
        ];
    }

    /**
     * Derive a package name from the repository URL
     *
     * Examples:
     *   https://github.com/vendor/package.git → vendor/package
     *   https://github.com/vendor/package     → vendor/package
     *   git@github.com:vendor/package.git     → vendor/package
     */
    private function derivePackageName(): string
    {
        $url = $this->url;

        // Remove trailing .git
        $url = preg_replace('/\.git$/', '', $url) ?? $url;

        // Handle SSH-style URLs: git@host:vendor/package
        if (preg_match('#[^/]+:([^/]+/[^/]+)$#', $url, $matches)) {
            return $matches[1];
        }

        // Handle HTTPS-style URLs: extract last two path segments as vendor/package
        $path = parse_url($url, PHP_URL_PATH);
        if (is_string($path)) {
            $path = trim($path, '/');
            $segments = explode('/', $path);
            $count = count($segments);
            if ($count >= 2) {
                return $segments[$count - 2] . '/' . $segments[$count - 1];
            }
        }

        return '';
    }
}
