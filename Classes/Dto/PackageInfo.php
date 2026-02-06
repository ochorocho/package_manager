<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Dto;

/**
 * Data transfer object for package information
 */
readonly class PackageInfo
{
    public function __construct(
        public string $name,
        public string $description,
        public string $version,
        public string $type,
        public string $url,
        public int $downloads,
        public int $favers,
        public string $source = 'packagist.org',
        public bool $isInstalled = false,
        public bool $hasUpdate = false,
        public string $installedVersion = '',
        public bool $isProtected = false,
    ) {}

    /**
     * Create from Packagist API search result
     *
     * @param array<string, mixed> $data
     */
    public static function fromPackagistSearch(array $data): self
    {
        return new self(
            name: $data['name'] ?? '',
            description: $data['description'] ?? '',
            version: '', // Search results don't include version
            type: $data['type'] ?? '',
            url: $data['url'] ?? '',
            downloads: (int)($data['downloads'] ?? 0),
            favers: (int)($data['favers'] ?? 0),
            source: 'packagist.org',
        );
    }

    /**
     * Create from Packagist API package details
     *
     * @param array<string, mixed> $data
     */
    public static function fromPackagistDetails(array $data): self
    {
        $package = $data['package'] ?? $data;
        $versions = $package['versions'] ?? [];
        $latestVersion = '';

        // Find the latest stable version
        foreach ($versions as $versionKey => $versionData) {
            // Skip dev versions
            if (str_starts_with($versionKey, 'dev-')) {
                continue;
            }
            $latestVersion = $versionKey;
            break;
        }

        return new self(
            name: $package['name'] ?? '',
            description: $package['description'] ?? '',
            version: $latestVersion,
            type: $package['type'] ?? '',
            url: $package['repository'] ?? '',
            downloads: (int)($package['downloads']['total'] ?? 0),
            favers: (int)($package['favers'] ?? 0),
            source: 'packagist.org',
        );
    }

    /**
     * Create from a Composer repository packages.json version entry
     *
     * @param array<string, mixed> $versionData
     */
    public static function fromComposerRepo(array $versionData, string $source): self
    {
        return new self(
            name: $versionData['name'] ?? '',
            description: $versionData['description'] ?? '',
            version: $versionData['version'] ?? '',
            type: $versionData['type'] ?? '',
            url: $versionData['source']['url'] ?? $versionData['homepage'] ?? '',
            downloads: 0,
            favers: 0,
            source: $source,
        );
    }

    /**
     * Create from a local composer.json file (path repository)
     *
     * @param array<string, mixed> $data
     */
    public static function fromLocalComposerJson(array $data, string $source): self
    {
        return new self(
            name: $data['name'] ?? '',
            description: $data['description'] ?? '',
            version: $data['version'] ?? 'dev',
            type: $data['type'] ?? '',
            url: '',
            downloads: 0,
            favers: 0,
            source: $source,
        );
    }

    /**
     * Create with installation status
     */
    public function withInstallationStatus(
        bool $isInstalled,
        string $installedVersion = '',
        bool $hasUpdate = false,
        bool $isProtected = false,
    ): self {
        return new self(
            name: $this->name,
            description: $this->description,
            version: $this->version,
            type: $this->type,
            url: $this->url,
            downloads: $this->downloads,
            favers: $this->favers,
            source: $this->source,
            isInstalled: $isInstalled,
            hasUpdate: $hasUpdate,
            installedVersion: $installedVersion,
            isProtected: $isProtected,
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'description' => $this->description,
            'version' => $this->version,
            'type' => $this->type,
            'url' => $this->url,
            'downloads' => $this->downloads,
            'favers' => $this->favers,
            'source' => $this->source,
            'isInstalled' => $this->isInstalled,
            'hasUpdate' => $this->hasUpdate,
            'installedVersion' => $this->installedVersion,
            'isProtected' => $this->isProtected,
        ];
    }
}
