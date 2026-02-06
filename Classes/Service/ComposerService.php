<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Service;

use Ochorocho\PackageManager\Dto\ComposerResult;
use Ochorocho\PackageManager\Exception\ComposerNotFoundException;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Process\Process;
use TYPO3\CMS\Core\Cache\Frontend\FrontendInterface;
use TYPO3\CMS\Core\Core\Environment;
use TYPO3\CMS\Core\Http\RequestFactory;
use TYPO3\CMS\Core\Utility\GeneralUtility;

/**
 * Service for executing composer operations
 *
 * Handles binary resolution, process execution, and all composer commands.
 * Safety measures: always --no-interaction, --no-ansi, dry-run by default.
 */
class ComposerService
{
    private const COMPOSER_DOWNLOAD_URL = 'https://getcomposer.org/download/latest-stable/composer.phar';
    private const COMPOSER_SHA256_URL = 'https://getcomposer.org/download/latest-stable/composer.phar.sha256sum';
    private const OPERATION_TIMEOUT = 300; // 5 minutes
    // `composer outdated` queries every package's remote registry. It stays
    // slow even with a warm cache; the frontend calls it via the cached
    // wrapper below instead of on the critical render path.
    private const INFO_TIMEOUT = 120;
    /**
     * How long to keep the `composer outdated` result in the cache frontend
     * (seconds). Orchestrator flushes the tag on every successful
     * require/update/remove, so this is only a safety net against slow
     * revalidation when no writes happen.
     */
    public const COMPOSER_OUTDATED_TTL = 900;
    public const CACHE_TAG_OUTDATED = 'composer_outdated';

    private ?string $resolvedBinaryPath = null;

    public function __construct(
        private readonly RequestFactory $requestFactory,
        #[Autowire(service: 'cache.package_manager')]
        private readonly FrontendInterface $cache,
    ) {}

    /**
     * Resolve the composer binary path
     *
     * Resolution order:
     * 1. composer in PATH
     * 2. composer.phar in project root
     * 3. composer.phar in bin-dir
     * 4. Download composer.phar to bin-dir (with SHA-256 verification)
     *
     * @throws ComposerNotFoundException
     */
    public function resolveComposerBinary(): string
    {
        if ($this->resolvedBinaryPath !== null) {
            return $this->resolvedBinaryPath;
        }

        // 1. Check for composer in PATH
        $composerInPath = $this->findInPath('composer');
        if ($composerInPath !== null) {
            $this->resolvedBinaryPath = $composerInPath;
            return $this->resolvedBinaryPath;
        }

        // 2. Check for composer.phar in project root
        $projectRoot = Environment::getProjectPath();
        $pharInRoot = $projectRoot . '/composer.phar';
        if (file_exists($pharInRoot) && is_executable($pharInRoot)) {
            $this->resolvedBinaryPath = $pharInRoot;
            return $this->resolvedBinaryPath;
        }

        // 3. Check in bin-dir
        $binDir = $this->getBinDir();
        $pharInBin = $binDir . '/composer.phar';
        if (file_exists($pharInBin)) {
            $this->resolvedBinaryPath = $pharInBin;
            return $this->resolvedBinaryPath;
        }

        // 4. Download composer.phar to bin-dir
        $this->downloadComposer($pharInBin);
        $this->resolvedBinaryPath = $pharInBin;
        return $this->resolvedBinaryPath;
    }

    /**
     * Get composer version string
     */
    public function getComposerVersion(): string
    {
        $process = $this->createProcess(['--version'], self::INFO_TIMEOUT);
        $process->run();

        if (!$process->isSuccessful()) {
            return 'Unknown';
        }

        // Parse version from output like "Composer version 2.7.1 2024-02-09 15:26:28"
        $output = trim($process->getOutput());
        if (preg_match('/Composer version ([^\s]+)/', $output, $matches)) {
            return $matches[1];
        }

        return $output;
    }

    /**
     * Get PHP version
     */
    public function getPhpVersion(): string
    {
        return PHP_VERSION;
    }

    /**
     * Get project path
     */
    public function getProjectPath(): string
    {
        return Environment::getProjectPath();
    }

    /**
     * Check if composer binary is available
     */
    public function isComposerAvailable(): bool
    {
        try {
            $this->resolveComposerBinary();
            return true;
        } catch (ComposerNotFoundException) {
            return false;
        }
    }

    /**
     * Get detailed composer binary information for the UI
     *
     * @return array{
     *     binaryPath: string,
     *     resolutionMethod: string,
     *     version: string,
     *     fullVersionOutput: string,
     *     composerHome: string,
     *     projectPath: string,
     * }
     */
    public function getComposerBinaryInfo(): array
    {
        $binaryPath = $this->resolveComposerBinary();

        return [
            'binaryPath' => $binaryPath,
            'resolutionMethod' => $this->getResolutionMethod($binaryPath),
            'version' => $this->getComposerVersion(),
            'fullVersionOutput' => $this->getFullVersionOutput(),
            'composerHome' => $this->getComposerHome(),
            'projectPath' => Environment::getProjectPath(),
        ];
    }

    /**
     * Run composer diagnostics
     *
     * @return array{
     *     composerJson: bool,
     *     lockFile: bool,
     *     lockFresh: bool,
     *     platform: array<string, string>
     * }
     */
    public function getComposerDiagnostics(): array
    {
        $projectPath = Environment::getProjectPath();

        $diagnostics = [
            'composerJson' => file_exists($projectPath . '/composer.json'),
            'lockFile' => file_exists($projectPath . '/composer.lock'),
            'lockFresh' => false,
            'platform' => [],
        ];

        // Check if lock file is up-to-date via composer validate
        if ($diagnostics['lockFile']) {
            $process = $this->createProcess(
                ['validate', '--no-interaction', '--no-ansi'],
                self::INFO_TIMEOUT
            );
            $process->run();
            $diagnostics['lockFresh'] = $process->isSuccessful();
        }

        // Get platform info
        $process = $this->createProcess(
            ['show', '--platform', '--format=json', '--no-interaction', '--no-ansi'],
            self::INFO_TIMEOUT
        );
        $process->run();

        if ($process->isSuccessful()) {
            $data = json_decode(trim($process->getOutput()), true);
            if (is_array($data) && isset($data['installed'])) {
                foreach ($data['installed'] as $pkg) {
                    $name = $pkg['name'] ?? '';
                    $version = $pkg['version'] ?? '';
                    if (!empty($name)) {
                        $diagnostics['platform'][$name] = $version;
                    }
                }
            }
        }

        return $diagnostics;
    }

    private function getResolutionMethod(string $binaryPath): string
    {
        $projectPath = Environment::getProjectPath();

        if ($binaryPath === $projectPath . '/composer.phar') {
            return 'Project root (composer.phar)';
        }
        if (str_starts_with($binaryPath, $this->getBinDir())) {
            return 'Bin directory (composer.phar)';
        }
        return 'System PATH';
    }

    private function getFullVersionOutput(): string
    {
        $process = $this->createProcess(['--version'], self::INFO_TIMEOUT);
        $process->run();
        return trim($process->getOutput());
    }

    private function getComposerHome(): string
    {
        $envHome = getenv('COMPOSER_HOME');
        if ($envHome !== false) {
            return $envHome;
        }
        return Environment::getVarPath() . '/composer';
    }

    /**
     * Get list of installed packages
     *
     * Reads from vendor/composer/installed.json which includes package types.
     * The `composer show --format=json` command doesn't include the type field.
     *
     * @return array<string, array<string, mixed>> Package name => package info
     */
    public function getInstalledPackages(): array
    {
        $installedJsonPath = Environment::getProjectPath() . '/vendor/composer/installed.json';

        if (!file_exists($installedJsonPath)) {
            return [];
        }

        $content = file_get_contents($installedJsonPath);
        if ($content === false) {
            return [];
        }

        $data = json_decode($content, true);
        if (!is_array($data)) {
            return [];
        }

        // installed.json can have packages at root level or under 'packages' key
        $packageList = $data['packages'] ?? $data;
        if (!is_array($packageList)) {
            return [];
        }

        $packages = [];
        foreach ($packageList as $package) {
            if (!isset($package['name'])) {
                continue;
            }
            $packages[$package['name']] = [
                'name' => $package['name'],
                'version' => $package['version'] ?? '',
                'description' => $package['description'] ?? '',
                'type' => $package['type'] ?? '',
            ];
        }

        return $packages;
    }

    /**
     * Get list of installed packages of type typo3-cms-extension
     *
     * @return array<string, array<string, mixed>>
     */
    public function getInstalledTypo3Extensions(): array
    {
        $allPackages = $this->getInstalledPackages();
        return array_filter(
            $allPackages,
            fn(array $pkg): bool => ($pkg['type'] ?? '') === 'typo3-cms-extension'
        );
    }

    /**
     * Get detailed info about a specific package
     *
     * @return array<string, mixed>
     */
    public function getPackageInfo(string $packageName): array
    {
        $process = $this->createProcess(
            ['show', $packageName, '--format=json', '--no-interaction', '--no-ansi'],
            self::INFO_TIMEOUT
        );
        $process->run();

        if (!$process->isSuccessful()) {
            return [];
        }

        $output = trim($process->getOutput());
        $data = json_decode($output, true);

        return is_array($data) ? $data : [];
    }

    /**
     * Check if a package has an available update
     *
     * @return array{hasUpdate: bool, currentVersion: string, latestVersion: string}
     */
    public function checkForUpdate(string $packageName): array
    {
        $process = $this->createProcess(
            ['outdated', $packageName, '--format=json', '--no-interaction', '--no-ansi'],
            self::INFO_TIMEOUT
        );
        $process->run();

        $result = [
            'hasUpdate' => false,
            'currentVersion' => '',
            'latestVersion' => '',
        ];

        if (!$process->isSuccessful()) {
            return $result;
        }

        $output = trim($process->getOutput());
        $data = json_decode($output, true);

        if (is_array($data) && isset($data['installed'])) {
            foreach ($data['installed'] as $package) {
                if (($package['name'] ?? '') === $packageName) {
                    $result['hasUpdate'] = true;
                    $result['currentVersion'] = $package['version'] ?? '';
                    $result['latestVersion'] = $package['latest'] ?? '';
                    break;
                }
            }
        }

        return $result;
    }

    /**
     * Get the `composer outdated` result, served from the cache frontend
     * when possible.
     *
     * Keyed on a fingerprint of composer.lock so any install/update/remove
     * naturally invalidates — and tagged so the orchestrator can flush
     * after an explicit mutation.
     *
     * @return array<string, array{current: string, latest: string, latestStatus: string}>
     */
    public function getOutdatedPackagesCached(bool $force = false): array
    {
        $identifier = $this->buildOutdatedCacheIdentifier();
        if (!$force) {
            $cached = $this->cache->get($identifier);
            if (is_array($cached)) {
                /** @var array<string, array{current: string, latest: string, latestStatus: string}> $cached */
                return $cached;
            }
        }
        $fresh = $this->getOutdatedPackages();
        $this->cache->set($identifier, $fresh, [self::CACHE_TAG_OUTDATED], self::COMPOSER_OUTDATED_TTL);
        return $fresh;
    }

    private function buildOutdatedCacheIdentifier(): string
    {
        $lockPath = Environment::getProjectPath() . '/composer.lock';
        if (file_exists($lockPath)) {
            $mtime = filemtime($lockPath);
            $size = filesize($lockPath);
            $fingerprint = sprintf('%d-%d', $mtime === false ? 0 : $mtime, $size === false ? 0 : $size);
        } else {
            $fingerprint = 'no-lock';
        }
        return 'outdated_' . hash('sha256', $fingerprint);
    }

    /**
     * Get all outdated packages (uncached — use `getOutdatedPackagesCached()`
     * from request handlers unless you specifically want to bypass the
     * cache frontend).
     *
     * @return array<string, array{current: string, latest: string, latestStatus: string}>
     */
    public function getOutdatedPackages(): array
    {
        $process = $this->createProcess(
            ['outdated', '--format=json', '--no-interaction', '--no-ansi'],
            self::INFO_TIMEOUT
        );
        $process->run();

        if (!$process->isSuccessful()) {
            return [];
        }

        $output = trim($process->getOutput());
        $data = json_decode($output, true);

        if (!is_array($data) || !isset($data['installed'])) {
            return [];
        }

        $outdated = [];
        foreach ($data['installed'] as $package) {
            $name = $package['name'] ?? '';
            if (empty($name)) {
                continue;
            }
            $outdated[$name] = [
                'current' => $package['version'] ?? '',
                'latest' => $package['latest'] ?? '',
                'latestStatus' => $package['latest-status'] ?? '',
            ];
        }

        return $outdated;
    }

    /**
     * Get dependency tree for all installed packages
     *
     * Uses `composer show -t --format=json` to get hierarchical dependency data.
     *
     * @param bool $directOnly When true, show only direct dependencies
     * @return array<string, mixed> Dependency tree structure
     */
    public function getDependencyTree(bool $directOnly = false): array
    {
        $args = ['show', '-t', '--format=json', '--no-interaction', '--no-ansi'];
        if ($directOnly) {
            $args[] = '--direct';
        }

        $process = $this->createProcess($args, self::INFO_TIMEOUT);
        $process->run();

        if (!$process->isSuccessful()) {
            return [];
        }

        $output = trim($process->getOutput());
        $data = json_decode($output, true);

        return is_array($data) ? $data : [];
    }

    /**
     * Run TYPO3 extension:setup command after package changes
     *
     * This activates newly installed extensions and updates the database schema.
     */
    public function runExtensionSetup(): ComposerResult
    {
        $typo3Binary = $this->getTypo3Binary();

        $process = new Process(
            [$typo3Binary, 'extension:setup'],
            Environment::getProjectPath(),
            $this->getEnvironment()
        );
        $process->setTimeout(self::OPERATION_TIMEOUT);
        $process->run();

        return new ComposerResult(
            success: $process->isSuccessful(),
            output: $process->getOutput(),
            errorOutput: $process->getErrorOutput(),
            exitCode: $process->getExitCode() ?? 1,
            isDryRun: false,
        );
    }

    /**
     * Flush TYPO3 caches after extension changes
     */
    public function flushCache(): ComposerResult
    {
        $typo3Binary = $this->getTypo3Binary();

        $process = new Process(
            [$typo3Binary, 'cache:flush'],
            Environment::getProjectPath(),
            $this->getEnvironment()
        );
        $process->setTimeout(self::INFO_TIMEOUT);
        $process->run();

        return new ComposerResult(
            success: $process->isSuccessful(),
            output: $process->getOutput(),
            errorOutput: $process->getErrorOutput(),
            exitCode: $process->getExitCode() ?? 1,
            isDryRun: false,
        );
    }

    /**
     * Get the path to the TYPO3 CLI binary
     */
    private function getTypo3Binary(): string
    {
        $binDir = $this->getBinDir();
        return $binDir . '/typo3';
    }

    /**
     * Require (install) one or more packages.
     *
     * @param string $packageNames Space-separated list of package names, or a single package name
     * @param bool $dryRun When true, only simulates the operation
     */
    public function requirePackage(string $packageNames, bool $dryRun = true): ComposerResult
    {
        $packages = array_values(array_filter(
            array_map('trim', explode(' ', $packageNames)),
            static fn(string $p): bool => $p !== ''
        ));
        return $this->executeComposerCommand(['require', ...$packages], $dryRun);
    }

    /**
     * Update a specific package.
     */
    public function updatePackage(string $packageName, bool $dryRun = true): ComposerResult
    {
        return $this->executeComposerCommand(['update', $packageName], $dryRun);
    }

    /**
     * Remove a package.
     */
    public function removePackage(string $packageName, bool $dryRun = true): ComposerResult
    {
        return $this->executeComposerCommand(['remove', $packageName], $dryRun);
    }

    /**
     * Execute a composer mutation command (require/update/remove) with the
     * standard non-interactive flags. Centralizes the symfony/process boilerplate
     * and the display-command formatting so the public API methods stay tiny.
     *
     * @param list<string> $args Composer subcommand + positional arguments
     */
    private function executeComposerCommand(array $args, bool $dryRun): ComposerResult
    {
        $args[] = '--no-interaction';
        $args[] = '--no-ansi';
        if ($dryRun) {
            $args[] = '--dry-run';
        }

        $process = $this->createProcess($args, self::OPERATION_TIMEOUT);
        $process->run();

        return new ComposerResult(
            success: $process->isSuccessful(),
            output: $process->getOutput(),
            errorOutput: $process->getErrorOutput(),
            exitCode: $process->getExitCode() ?? 1,
            isDryRun: $dryRun,
            command: $this->buildDisplayCommand($args),
        );
    }

    /**
     * Build a display-friendly command string for the UI
     *
     * @param list<string> $args Composer arguments
     */
    private function buildDisplayCommand(array $args): string
    {
        return 'composer ' . implode(' ', array_map(
            fn(string $arg): string => str_contains($arg, ' ') ? '"' . $arg . '"' : $arg,
            $args
        ));
    }

    /**
     * Parse composer output to extract structured information for UI display
     *
     * Since composer's require/update/remove don't support --format=json,
     * we parse the text output with regex to extract key information.
     *
     * @return array{
     *     operations: list<array{action: string, package: string, version: string, newVersion?: string}>,
     *     warnings: list<string>,
     *     errors: list<string>,
     *     summary: string
     * }
     */
    public function parseComposerOutput(string $output, string $errorOutput): array
    {
        $result = [
            'operations' => [],
            'warnings' => [],
            'errors' => [],
            'summary' => '',
        ];

        // Parse operations from output
        // Pattern: "- Installing vendor/package (v1.2.3)"
        // Pattern: "- Updating vendor/package (v1.0.0 => v2.0.0)"
        // Pattern: "- Removing vendor/package (v1.2.3)"
        // Pattern: "- Downgrading vendor/package (v2.0.0 => v1.0.0)"
        preg_match_all(
            '/- (Installing|Updating|Removing|Downgrading) ([^\s]+) \(([^)]+)\)/i',
            $output,
            $matches,
            PREG_SET_ORDER
        );

        foreach ($matches as $match) {
            $operation = [
                'action' => strtolower($match[1]),
                'package' => $match[2],
                'version' => $match[3],
            ];

            // For updates/downgrades, split version info (e.g., "v1.0.0 => v2.0.0")
            if (str_contains($match[3], '=>')) {
                [$old, $new] = array_map('trim', explode('=>', $match[3]));
                $operation['version'] = $old;
                $operation['newVersion'] = $new;
            }

            $result['operations'][] = $operation;
        }

        // Extract warnings from output
        preg_match_all('/^(?:Warning|warning): (.+)$/m', $output . "\n" . $errorOutput, $warnings);
        $result['warnings'] = $warnings[1] ?? [];

        // Parse common error patterns into user-friendly messages
        $combinedOutput = $output . "\n" . $errorOutput;

        if (preg_match('/Could not find (a version of )?package ([^\s]+) matching/', $combinedOutput, $m)) {
            $result['errors'][] = sprintf(
                'Package "%s" was not found or has no version matching your constraints.',
                $m[2]
            );
        }

        if (preg_match('/Package ([^\s]+) is not installed/', $combinedOutput, $m)) {
            $result['errors'][] = sprintf('Package "%s" is not currently installed.', $m[1]);
        }

        if (preg_match('/requires ([^\s]+) ([^\s]+) but ([^\s]+) is installed/', $combinedOutput, $m)) {
            $result['errors'][] = sprintf(
                'Version conflict: requires %s %s, but %s is installed.',
                $m[1],
                $m[2],
                $m[3]
            );
        }

        if (str_contains($combinedOutput, 'Your requirements could not be resolved')) {
            $result['errors'][] = 'Dependency conflict: The package requirements cannot be satisfied with your current dependencies.';
        }

        if (str_contains($combinedOutput, 'minimum-stability')) {
            $result['errors'][] = 'Stability issue: The package requires a different stability level (e.g., dev, alpha, beta) than your project allows.';
        }

        if (preg_match('/requires php ([^\s]+) but your php version \(([^)]+)\)/', $combinedOutput, $m)) {
            $result['errors'][] = sprintf(
                'PHP version mismatch: Package requires PHP %s, but you have PHP %s.',
                $m[1],
                $m[2]
            );
        }

        if (str_contains($combinedOutput, 'Authentication required')) {
            $result['errors'][] = 'Authentication required: This package requires authentication. Please configure your Composer auth.json.';
        }

        if (str_contains($combinedOutput, 'Could not fetch') || str_contains($combinedOutput, 'Failed to download')) {
            $result['errors'][] = 'Network error: Failed to download package. Please check your internet connection and try again.';
        }

        // Generate summary
        $opCount = count($result['operations']);
        $warningCount = count($result['warnings']);
        $errorCount = count($result['errors']);

        if ($errorCount > 0) {
            $result['summary'] = sprintf('%d issue(s) found that prevent this operation.', $errorCount);
        } elseif ($opCount > 0) {
            $actions = array_count_values(array_column($result['operations'], 'action'));
            $parts = [];
            foreach (['installing' => 'install', 'updating' => 'update', 'removing' => 'remove', 'downgrading' => 'downgrade'] as $action => $verb) {
                if (isset($actions[$action])) {
                    $parts[] = sprintf('%d to %s', $actions[$action], $verb);
                }
            }
            $result['summary'] = 'Packages: ' . implode(', ', $parts) . '.';
            if ($warningCount > 0) {
                $result['summary'] .= sprintf(' (%d warning%s)', $warningCount, $warningCount > 1 ? 's' : '');
            }
        } else {
            $result['summary'] = 'No changes required.';
        }

        return $result;
    }

    /**
     * Create a configured Process instance
     *
     * @param list<string> $arguments Composer arguments (without the binary)
     */
    private function createProcess(array $arguments, int $timeout): Process
    {
        $binary = $this->resolveComposerBinary();
        $command = array_merge([$binary], $arguments);

        $process = new Process(
            $command,
            Environment::getProjectPath(),
            $this->getEnvironment()
        );
        $process->setTimeout($timeout);

        return $process;
    }

    /**
     * Get environment variables for composer process
     *
     * @return array<string, string>
     */
    private function getEnvironment(): array
    {
        $env = [];

        // Set COMPOSER_HOME if not already set
        $composerHome = getenv('COMPOSER_HOME');
        if ($composerHome === false) {
            $env['COMPOSER_HOME'] = Environment::getVarPath() . '/composer';
        }

        // Disable ANSI colors
        $env['NO_COLOR'] = '1';

        return $env;
    }

    /**
     * Find an executable in PATH
     */
    private function findInPath(string $name): ?string
    {
        $process = new Process(['which', $name]);
        $process->run();

        if ($process->isSuccessful()) {
            $path = trim($process->getOutput());
            if (!empty($path) && is_executable($path)) {
                return $path;
            }
        }

        return null;
    }

    /**
     * Get the composer bin-dir
     */
    private function getBinDir(): string
    {
        $projectPath = Environment::getProjectPath();
        $composerJson = $projectPath . '/composer.json';

        if (file_exists($composerJson)) {
            $content = file_get_contents($composerJson);
            if ($content !== false) {
                $data = json_decode($content, true);
                if (is_array($data) && isset($data['config']['bin-dir'])) {
                    return $projectPath . '/' . $data['config']['bin-dir'];
                }
            }
        }

        // Default bin-dir
        return $projectPath . '/vendor/bin';
    }

    /**
     * Download composer.phar with SHA-256 verification
     *
     * @throws ComposerNotFoundException
     */
    private function downloadComposer(string $targetPath): void
    {
        $targetDir = dirname($targetPath);
        if (!is_dir($targetDir)) {
            GeneralUtility::mkdir_deep($targetDir);
        }

        try {
            // Download composer.phar
            $response = $this->requestFactory->request(self::COMPOSER_DOWNLOAD_URL, 'GET', [
                'timeout' => 60,
            ]);

            if ($response->getStatusCode() !== 200) {
                throw new ComposerNotFoundException(
                    'Failed to download composer.phar: HTTP ' . $response->getStatusCode(),
                    1700000001
                );
            }

            $pharContent = $response->getBody()->getContents();

            // Download and verify SHA-256
            $sha256Response = $this->requestFactory->request(self::COMPOSER_SHA256_URL, 'GET', [
                'timeout' => 30,
            ]);

            if ($sha256Response->getStatusCode() === 200) {
                $sha256Content = trim($sha256Response->getBody()->getContents());
                // Format is "sha256hash  filename" - extract just the hash
                $expectedHash = explode(' ', $sha256Content)[0];
                $actualHash = hash('sha256', $pharContent);

                if ($expectedHash !== $actualHash) {
                    throw new ComposerNotFoundException(
                        'SHA-256 verification failed for downloaded composer.phar',
                        1700000002
                    );
                }
            }

            // Write the file
            if (file_put_contents($targetPath, $pharContent) === false) {
                throw new ComposerNotFoundException(
                    'Failed to write composer.phar to ' . $targetPath,
                    1700000003
                );
            }

            // Make executable
            chmod($targetPath, 0755);
        } catch (\Throwable $e) {
            if ($e instanceof ComposerNotFoundException) {
                throw $e;
            }
            throw new ComposerNotFoundException(
                'Failed to download composer: ' . $e->getMessage(),
                1700000004,
                $e
            );
        }
    }
}
