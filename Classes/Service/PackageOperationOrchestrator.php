<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Service;

use Ochorocho\PackageManager\Dto\ComposerResult;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use TYPO3\CMS\Core\Cache\Frontend\FrontendInterface;

/**
 * Coordinates the full lifecycle of a composer package mutation:
 *
 *   1. Run the composer command (require / update / remove)
 *   2. On a successful real run (not a dry run), run `typo3 extension:setup`
 *      to register newly installed extensions, then `typo3 cache:flush` to
 *      drop stale caches.
 *
 * Each step's output is appended to a single combined output string that
 * the AJAX layer ships back to the JS client. Returns a typed result so
 * the controller can flatten it to JSON without re-implementing the
 * post-install bookkeeping per endpoint.
 */
final readonly class PackageOperationOrchestrator
{
    /**
     * Operations whose successful real run triggers extension:setup +
     * cache:flush. Removing a package does not need extension:setup but
     * still benefits from a cache flush.
     */
    private const POST_INSTALL_KINDS = ['require', 'update'];

    public function __construct(
        private ComposerService $composerService,
        #[Autowire(service: 'cache.package_manager')]
        private FrontendInterface $cache,
    ) {}

    /**
     * @param 'require'|'update'|'remove' $kind
     */
    public function execute(string $kind, string $package, bool $dryRun): OperationResult
    {
        $composerResult = match ($kind) {
            'require' => $this->composerService->requirePackage($package, $dryRun),
            'update' => $this->composerService->updatePackage($package, $dryRun),
            'remove' => $this->composerService->removePackage($package, $dryRun),
        };

        $output = $composerResult->output;
        $extensionSetup = null;
        $cacheFlush = null;

        if ($composerResult->success && !$dryRun) {
            // Whatever the kind, composer.lock has likely changed and the
            // cached `composer outdated` snapshot is stale.
            $this->cache->flushByTag(ComposerService::CACHE_TAG_OUTDATED);

            if (in_array($kind, self::POST_INSTALL_KINDS, true)) {
                $extensionSetup = $this->composerService->runExtensionSetup();
                $output .= $this->formatStep('Extension Setup', $extensionSetup);

                $cacheFlush = $this->composerService->flushCache();
                $output .= $this->formatStep('Cache Flush', $cacheFlush);
            }
        }

        return new OperationResult(
            kind: $kind,
            package: $package,
            composer: $composerResult,
            extensionSetup: $extensionSetup,
            cacheFlush: $cacheFlush,
            combinedOutput: $output,
        );
    }

    private function formatStep(string $title, ComposerResult $result): string
    {
        $heading = $result->success ? sprintf("\n\n--- %s ---\n", $title) : sprintf("\n\n--- %s (Warning) ---\n", $title);
        $body = $heading . $result->output;
        if (!$result->success && $result->errorOutput !== '') {
            $body .= "\nErrors: " . $result->errorOutput;
        }
        return $body;
    }
}
