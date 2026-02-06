<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Controller;

use Ochorocho\PackageManager\Http\RequestInput;
use Ochorocho\PackageManager\Search\PackageSearchService;
use Ochorocho\PackageManager\Service\ComposerService;
use Ochorocho\PackageManager\Service\OperationResult;
use Ochorocho\PackageManager\Service\PackageOperationOrchestrator;
use Ochorocho\PackageManager\Service\PackageProtectionService;
use Ochorocho\PackageManager\Service\PackagistService;
use Ochorocho\PackageManager\Service\RepositoryService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Backend\Attribute\AsController;
use TYPO3\CMS\Core\Http\JsonResponse;

/**
 * AJAX controller for Package Manager operations
 *
 * All endpoints return JSON responses. Mutation operations (require, update, remove)
 * follow a two-step workflow:
 * 1. First call with dryRun=true returns a preview of what would happen
 * 2. Second call with dryRun=false and confirmed=true executes the operation
 */
#[AsController]
class PackageManagerAjaxController
{
    private const PACKAGE_NAME_PATTERN = '/^[a-z0-9]([_.-]?[a-z0-9]+)*\/[a-z0-9](([_.]|-{1,2})?[a-z0-9]+)*$/';

    public function __construct(
        private readonly ComposerService $composerService,
        private readonly PackagistService $packagistService,
        private readonly PackageProtectionService $protectionService,
        private readonly RepositoryService $repositoryService,
        private readonly PackageSearchService $packageSearchService,
        private readonly PackageOperationOrchestrator $operationOrchestrator,
    ) {}

    /**
     * Return the list of installed TYPO3 extension packages.
     *
     * Fast by design — reads `vendor/composer/installed.json` only, no
     * network. "Update available" information comes from a separate
     * `/package-manager/outdated` request so the tab can paint
     * immediately.
     */
    public function getInstalledPackages(ServerRequestInterface $request): ResponseInterface
    {
        $packages = $this->composerService->getInstalledTypo3Extensions();

        $result = [];
        foreach ($packages as $name => $package) {
            $result[] = [
                'name' => $package['name'],
                'version' => $package['version'],
                'description' => $package['description'],
                'type' => $package['type'],
                'isProtected' => $this->protectionService->isProtected($name),
            ];
        }
        usort($result, static fn(array $a, array $b): int => strcasecmp($a['name'], $b['name']));

        return new JsonResponse([
            'status' => 'ok',
            'packages' => $result,
        ]);
    }

    /**
     * Return the `composer outdated` map for all installed packages.
     *
     * Served from the `cache.package_manager` frontend with a 15-minute
     * TTL; invalidated on any successful require/update/remove via the
     * `composer_outdated` tag. Pass `?force=1` to bypass the cache.
     */
    public function getOutdatedPackages(ServerRequestInterface $request): ResponseInterface
    {
        $force = ($request->getQueryParams()['force'] ?? '') === '1';
        $outdated = $this->composerService->getOutdatedPackagesCached($force);

        return new JsonResponse([
            'status' => 'ok',
            'outdated' => $outdated,
        ]);
    }

    /**
     * Get detailed information about a specific package
     *
     * Combines local composer info with Packagist version data for a complete view.
     */
    public function getPackageInfo(ServerRequestInterface $request): ResponseInterface
    {
        $queryParams = $request->getQueryParams();
        $packageName = trim((string)($queryParams['package'] ?? ''));

        if (empty($packageName)) {
            return new JsonResponse([
                'status' => 'error',
                'message' => 'Package name is required',
            ], 400);
        }

        // Get local composer info
        $info = $this->composerService->getPackageInfo($packageName);

        if (empty($info)) {
            return new JsonResponse([
                'status' => 'error',
                'message' => 'Package not found or could not retrieve info',
            ], 404);
        }

        // Get available versions from Packagist
        $availableVersions = $this->packagistService->getPackageVersions($packageName);

        // Add available versions to info
        $info['availableVersions'] = $availableVersions;

        return new JsonResponse([
            'status' => 'ok',
            'info' => $info,
        ]);
    }

    /**
     * Search for packages across all configured repositories and Packagist
     */
    public function searchPackages(ServerRequestInterface $request): ResponseInterface
    {
        $queryParams = $request->getQueryParams();
        $query = trim((string)($queryParams['q'] ?? ''));
        $page = max(1, (int)($queryParams['page'] ?? 1));

        if (empty($query)) {
            return new JsonResponse([
                'status' => 'ok',
                'packages' => [],
                'localResults' => [],
                'sources' => [],
                'total' => 0,
                'page' => $page,
                'perPage' => 15,
                'totalPages' => 0,
            ]);
        }

        $searchResult = $this->packageSearchService->search($query, $page);

        // Get installed packages to mark as installed
        $installed = $this->composerService->getInstalledPackages();

        // Enrich local results with installation status
        $localPackages = [];
        foreach ($searchResult['localResults'] as $packageInfo) {
            $isInstalled = isset($installed[$packageInfo->name]);
            $installedVersion = $isInstalled ? ($installed[$packageInfo->name]['version'] ?? '') : '';
            $isProtected = $this->protectionService->isProtected($packageInfo->name);

            $localPackages[] = $packageInfo
                ->withInstallationStatus($isInstalled, $installedVersion, false, $isProtected)
                ->toArray();
        }

        // Enrich Packagist results with installation status
        $packagistPackages = [];
        foreach ($searchResult['packagistResults']['packages'] as $packageInfo) {
            $isInstalled = isset($installed[$packageInfo->name]);
            $installedVersion = $isInstalled ? ($installed[$packageInfo->name]['version'] ?? '') : '';
            $isProtected = $this->protectionService->isProtected($packageInfo->name);

            $packagistPackages[] = $packageInfo
                ->withInstallationStatus($isInstalled, $installedVersion, false, $isProtected)
                ->toArray();
        }

        return new JsonResponse([
            'status' => 'ok',
            'packages' => $packagistPackages,
            'localResults' => $localPackages,
            'sources' => $searchResult['sources'],
            'total' => $searchResult['packagistResults']['total'],
            'page' => $searchResult['packagistResults']['page'],
            'perPage' => $searchResult['packagistResults']['perPage'],
            'totalPages' => $searchResult['packagistResults']['totalPages'],
        ]);
    }

    /**
     * Install (require) a package
     *
     * Two-step workflow:
     * - POST with dryRun=true (default) returns preview
     * - POST with dryRun=false and confirmed=true executes installation
     *
     * After successful installation, runs TYPO3 extension:setup to activate
     * the newly installed extension.
     */
    public function requirePackage(ServerRequestInterface $request): ResponseInterface
    {
        $input = RequestInput::fromBody($request->getParsedBody());
        $packageName = $input->getString('package');

        if ($packageName === '') {
            return $this->errorResponse('Package name is required', 400);
        }
        if (!preg_match(self::PACKAGE_NAME_PATTERN, $packageName)) {
            return $this->errorResponse('Invalid package name format. Expected format: vendor/package-name', 400);
        }
        if (($error = $this->validateConfirmation($input, 'installation')) !== null) {
            return $error;
        }

        $result = $this->operationOrchestrator->execute('require', $packageName, $input->getBool('dryRun', true));
        return $this->operationResponse($result);
    }

    /**
     * Update a package
     *
     * Two-step workflow:
     * - POST with dryRun=true (default) returns preview
     * - POST with dryRun=false and confirmed=true executes update
     *
     * After successful update, runs TYPO3 extension:setup to apply any
     * database schema changes or other setup tasks.
     */
    public function updatePackage(ServerRequestInterface $request): ResponseInterface
    {
        $input = RequestInput::fromBody($request->getParsedBody());
        $packageName = $input->getString('package');

        if ($packageName === '') {
            return $this->errorResponse('Package name is required', 400);
        }
        if (($error = $this->validateConfirmation($input, 'update')) !== null) {
            return $error;
        }

        $result = $this->operationOrchestrator->execute('update', $packageName, $input->getBool('dryRun', true));
        return $this->operationResponse($result);
    }

    /**
     * Remove a package
     *
     * Two-step workflow:
     * - POST with dryRun=true (default) returns preview
     * - POST with dryRun=false and confirmed=true executes removal
     *
     * Protected packages cannot be removed.
     */
    public function removePackage(ServerRequestInterface $request): ResponseInterface
    {
        $input = RequestInput::fromBody($request->getParsedBody());
        $packageName = $input->getString('package');

        if ($packageName === '') {
            return $this->errorResponse('Package name is required', 400);
        }
        if ($this->protectionService->isProtected($packageName)) {
            return new JsonResponse([
                'status' => 'error',
                'message' => sprintf(
                    'Package "%s" is protected and cannot be removed. Protected packages are critical for system stability.',
                    $packageName
                ),
                'protected' => true,
            ], 403);
        }
        if (($error = $this->validateConfirmation($input, 'removal. Please review the dry-run output first')) !== null) {
            return $error;
        }

        $result = $this->operationOrchestrator->execute('remove', $packageName, $input->getBool('dryRun', true));
        return $this->operationResponse($result);
    }

    private function errorResponse(string $message, int $status): JsonResponse
    {
        return new JsonResponse([
            'status' => 'error',
            'message' => $message,
        ], $status);
    }

    /**
     * Returns a 400 JsonResponse if the body asks for a non-dryRun run
     * without `confirmed=true`. Returns null when the request is fine.
     */
    private function validateConfirmation(RequestInput $input, string $action): ?JsonResponse
    {
        $dryRun = $input->getBool('dryRun', true);
        $confirmed = $input->getBool('confirmed', false);
        if (!$dryRun && !$confirmed) {
            return $this->errorResponse(sprintf('Confirmation required for actual %s', $action), 400);
        }
        return null;
    }

    private function operationResponse(OperationResult $result): JsonResponse
    {
        $composer = $result->composer;
        $parsed = $this->composerService->parseComposerOutput(
            $result->combinedOutput,
            $composer->errorOutput
        );

        return new JsonResponse([
            'status' => $composer->success ? 'ok' : 'error',
            'success' => $composer->success,
            'operation' => $result->kind,
            'package' => $result->package,
            'dryRun' => $composer->isDryRun,
            'command' => $composer->command,
            'output' => $result->combinedOutput,
            'errorOutput' => $composer->errorOutput,
            'exitCode' => $composer->exitCode,
            'parsed' => $parsed,
            'extensionSetupRan' => $result->ranExtensionSetup(),
            'extensionSetupSuccess' => $result->extensionSetupSucceeded(),
            'cacheFlushRan' => $result->ranCacheFlush(),
            'cacheFlushSuccess' => $result->cacheFlushSucceeded(),
        ]);
    }

    /**
     * Get composer and system information
     */
    public function getComposerInfo(ServerRequestInterface $request): ResponseInterface
    {
        $composerAvailable = $this->composerService->isComposerAvailable();

        $info = [
            'composerAvailable' => $composerAvailable,
            'phpVersion' => $this->composerService->getPhpVersion(),
            'protectedPackages' => $this->protectionService->getProtectedPackages(),
        ];

        if ($composerAvailable) {
            $info['binaryInfo'] = $this->composerService->getComposerBinaryInfo();
            $info['diagnostics'] = $this->composerService->getComposerDiagnostics();
        }

        return new JsonResponse([
            'status' => 'ok',
            'info' => $info,
        ]);
    }

    /**
     * Clear all search caches (Packagist + local repositories)
     */
    public function clearCache(ServerRequestInterface $request): ResponseInterface
    {
        $this->packageSearchService->clearCache();

        return new JsonResponse([
            'status' => 'ok',
            'message' => 'Cache cleared successfully',
        ]);
    }

    /**
     * Get dependency tree for all installed packages
     */
    public function getDependencyTree(ServerRequestInterface $request): ResponseInterface
    {
        $queryParams = $request->getQueryParams();
        $directOnly = ($queryParams['directOnly'] ?? false) !== false;

        $tree = $this->composerService->getDependencyTree($directOnly);

        return new JsonResponse([
            'status' => 'ok',
            'tree' => $tree,
        ]);
    }

    /**
     * Get suggested packages for a specific package
     */
    public function getPackageSuggestions(ServerRequestInterface $request): ResponseInterface
    {
        $queryParams = $request->getQueryParams();
        $packageName = trim((string)($queryParams['package'] ?? ''));

        if (empty($packageName)) {
            return new JsonResponse([
                'status' => 'error',
                'message' => 'Package name is required',
            ], 400);
        }

        $suggestions = $this->packagistService->getPackageSuggestions($packageName);

        return new JsonResponse([
            'status' => 'ok',
            'suggestions' => $suggestions,
        ]);
    }

    /**
     * Get configured repositories and authentication entries
     */
    public function getRepositories(ServerRequestInterface $request): ResponseInterface
    {
        return new JsonResponse([
            'status' => 'ok',
            'repositories' => $this->repositoryService->listRepositories(),
            'auth' => $this->repositoryService->listAuth(),
        ]);
    }

    /**
     * Add a repository to composer.json
     */
    public function addRepository(ServerRequestInterface $request): ResponseInterface
    {
        $body = $request->getParsedBody();
        $name = trim((string)($body['name'] ?? ''));
        $type = trim((string)($body['type'] ?? ''));
        $url = trim((string)($body['url'] ?? ''));

        if (empty($name) || empty($type) || empty($url)) {
            return new JsonResponse([
                'status' => 'error',
                'message' => 'Name, type, and URL are required',
            ], 400);
        }

        // Validate repository name (alphanumeric + hyphens + underscores)
        if (!preg_match('/^[a-zA-Z0-9_-]+$/', $name)) {
            return new JsonResponse([
                'status' => 'error',
                'message' => 'Repository name must contain only letters, numbers, hyphens, and underscores',
            ], 400);
        }

        // Validate type
        $allowedTypes = ['vcs', 'composer', 'path', 'artifact'];
        if (!in_array($type, $allowedTypes, true)) {
            return new JsonResponse([
                'status' => 'error',
                'message' => 'Invalid repository type. Allowed: ' . implode(', ', $allowedTypes),
            ], 400);
        }

        $result = $this->repositoryService->addRepository($name, $type, $url);

        return new JsonResponse([
            'status' => $result->success ? 'ok' : 'error',
            'success' => $result->success,
            'command' => $result->command,
            'output' => $result->output,
            'errorOutput' => $result->errorOutput,
        ]);
    }

    /**
     * Remove a repository from composer.json
     */
    public function removeRepository(ServerRequestInterface $request): ResponseInterface
    {
        $body = $request->getParsedBody();
        $name = trim((string)($body['name'] ?? ''));

        if (empty($name)) {
            return new JsonResponse([
                'status' => 'error',
                'message' => 'Repository name is required',
            ], 400);
        }

        $result = $this->repositoryService->removeRepository($name);

        return new JsonResponse([
            'status' => $result->success ? 'ok' : 'error',
            'success' => $result->success,
            'command' => $result->command,
            'output' => $result->output,
            'errorOutput' => $result->errorOutput,
        ]);
    }

    /**
     * Get configured authentication entries (host + type only, never credentials)
     */
    public function getAuth(ServerRequestInterface $request): ResponseInterface
    {
        return new JsonResponse([
            'status' => 'ok',
            'auth' => $this->repositoryService->listAuth(),
        ]);
    }

    /**
     * Set authentication for a host
     */
    public function setAuth(ServerRequestInterface $request): ResponseInterface
    {
        $body = $request->getParsedBody();
        $type = trim((string)($body['type'] ?? ''));
        $host = trim((string)($body['host'] ?? ''));
        $credentials = is_array($body['credentials'] ?? null) ? $body['credentials'] : [];

        if (empty($type) || empty($host)) {
            return new JsonResponse([
                'status' => 'error',
                'message' => 'Auth type and host are required',
            ], 400);
        }

        $result = $this->repositoryService->setAuth($type, $host, $credentials);

        return new JsonResponse([
            'status' => $result->success ? 'ok' : 'error',
            'success' => $result->success,
            'command' => $result->command,
            'output' => $result->output,
            'errorOutput' => $result->errorOutput,
        ]);
    }

    /**
     * Remove authentication for a host
     */
    public function removeAuth(ServerRequestInterface $request): ResponseInterface
    {
        $body = $request->getParsedBody();
        $type = trim((string)($body['type'] ?? ''));
        $host = trim((string)($body['host'] ?? ''));

        if (empty($type) || empty($host)) {
            return new JsonResponse([
                'status' => 'error',
                'message' => 'Auth type and host are required',
            ], 400);
        }

        $result = $this->repositoryService->removeAuth($type, $host);

        return new JsonResponse([
            'status' => $result->success ? 'ok' : 'error',
            'success' => $result->success,
            'command' => $result->command,
            'output' => $result->output,
            'errorOutput' => $result->errorOutput,
        ]);
    }
}
