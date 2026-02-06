<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Service;

use Ochorocho\PackageManager\Dto\ComposerResult;

/**
 * Aggregate result for a full composer operation lifecycle:
 * the primary composer command plus any post-install extension:setup
 * and cache:flush invocations.
 */
final readonly class OperationResult
{
    public function __construct(
        public string $kind,
        public string $package,
        public ComposerResult $composer,
        public ?ComposerResult $extensionSetup,
        public ?ComposerResult $cacheFlush,
        public string $combinedOutput,
    ) {}

    public function ranExtensionSetup(): bool
    {
        return $this->extensionSetup !== null;
    }

    public function extensionSetupSucceeded(): bool
    {
        return $this->extensionSetup === null ? true : $this->extensionSetup->success;
    }

    public function ranCacheFlush(): bool
    {
        return $this->cacheFlush !== null;
    }

    public function cacheFlushSucceeded(): bool
    {
        return $this->cacheFlush === null ? true : $this->cacheFlush->success;
    }
}
