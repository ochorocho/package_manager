<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Search;

use Ochorocho\PackageManager\Dto\PackageInfo;

/**
 * Interface for package search providers
 *
 * Each provider searches a specific repository type (path, composer, vcs).
 * Providers return full result lists (no pagination) since non-Packagist
 * repositories typically contain fewer than 100 packages.
 */
interface PackageSearchProviderInterface
{
    /**
     * Unique identifier for this provider (used for cache keys)
     */
    public function getIdentifier(): string;

    /**
     * Human-readable label (displayed in the UI as source name)
     */
    public function getLabel(): string;

    /**
     * Search for packages matching the query
     *
     * @return list<PackageInfo>
     */
    public function search(string $query): array;
}
