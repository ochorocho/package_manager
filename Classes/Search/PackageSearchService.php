<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Search;

use Ochorocho\PackageManager\Dto\PackageInfo;
use Ochorocho\PackageManager\Service\PackagistService;
use Ochorocho\PackageManager\Service\RepositoryService;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use TYPO3\CMS\Core\Cache\Frontend\FrontendInterface;
use TYPO3\CMS\Core\Core\Environment;
use TYPO3\CMS\Core\Http\RequestFactory;

/**
 * Aggregator service for searching packages across all configured repositories
 *
 * Searches Packagist (paginated) and all non-Packagist repositories (full list)
 * and returns merged results with source attribution.
 */
class PackageSearchService
{
    public function __construct(
        private readonly PackagistService $packagistService,
        private readonly RepositoryService $repositoryService,
        private readonly RequestFactory $requestFactory,
        #[Autowire(service: 'cache.package_manager')]
        private readonly FrontendInterface $cache,
        private readonly LoggerInterface $logger,
    ) {}

    /**
     * Search across all configured repositories + Packagist
     *
     * @return array{
     *   localResults: list<PackageInfo>,
     *   packagistResults: array{packages: list<PackageInfo>, total: int, page: int, perPage: int, totalPages: int},
     *   sources: list<array{identifier: string, label: string, type: string, count: int}>
     * }
     */
    public function search(string $query, int $page = 1): array
    {
        // Build providers from configured repositories
        $providers = $this->createProviders();

        // Search all non-Packagist providers
        $localResults = [];
        $sources = [];
        foreach ($providers as $provider) {
            try {
                $results = $provider->search($query);
                if ($results !== []) {
                    array_push($localResults, ...$results);
                    $sources[] = [
                        'identifier' => $provider->getIdentifier(),
                        'label' => $provider->getLabel(),
                        'type' => 'local',
                        'count' => count($results),
                    ];
                }
            } catch (\Throwable $e) {
                $this->logger->warning('Search provider failed', [
                    'provider' => $provider->getIdentifier(),
                    'exception' => $e->getMessage(),
                ]);
            }
        }

        // Search Packagist (paginated)
        $packagistResults = $this->packagistService->search($query, $page);

        if ($packagistResults['total'] > 0) {
            $sources[] = [
                'identifier' => 'packagist',
                'label' => 'Packagist.org',
                'type' => 'packagist',
                'count' => $packagistResults['total'],
            ];
        }

        return [
            'localResults' => $localResults,
            'packagistResults' => $packagistResults,
            'sources' => $sources,
        ];
    }

    /**
     * Clear all search caches (Packagist + local repos)
     */
    public function clearCache(): void
    {
        $this->packagistService->clearCache();
        $this->cache->flushByTag('composer_repo');
        $this->cache->flushByTag('path_repo');
        $this->cache->flushByTag('vcs_repo');
    }

    /**
     * Create search providers for all configured non-Packagist repositories
     *
     * @return list<PackageSearchProviderInterface>
     */
    private function createProviders(): array
    {
        $repos = $this->repositoryService->listRepositories();
        $providers = [];

        foreach ($repos as $repo) {
            $name = $repo['name'] ?? '';
            $type = $repo['type'] ?? '';
            $url = $repo['url'] ?? '';

            if ($name === '' || $url === '') {
                continue;
            }

            $provider = match ($type) {
                'composer' => new ComposerRepoSearchProvider(
                    $name,
                    $url,
                    $this->requestFactory,
                    $this->cache,
                    $this->logger,
                    $this->repositoryService->getAuthHeadersForUrl($url),
                ),
                'path' => new PathRepoSearchProvider(
                    $name,
                    $url,
                    Environment::getProjectPath(),
                    $this->cache,
                    $this->logger,
                ),
                'vcs' => new VcsRepoSearchProvider(
                    $name,
                    $url,
                    $this->cache,
                    $this->logger,
                ),
                default => null,
            };

            if ($provider !== null) {
                $providers[] = $provider;
            }
        }

        return $providers;
    }
}
