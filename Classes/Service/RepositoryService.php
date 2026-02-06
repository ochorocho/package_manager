<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Service;

use Ochorocho\PackageManager\Dto\ComposerResult;
use Symfony\Component\Process\Process;
use TYPO3\CMS\Core\Core\Environment;

/**
 * Service for managing composer repositories and authentication
 *
 * Uses `composer config` commands for repository management.
 * Auth is stored per-project in auth.json at the project root.
 */
class RepositoryService
{
    private const COMMAND_TIMEOUT = 30;

    /**
     * Map of auth config keys to human-readable labels
     */
    private const AUTH_TYPE_LABELS = [
        'http-basic' => 'HTTP Basic',
        'bearer' => 'Bearer Token',
        'github-oauth' => 'GitHub OAuth',
        'gitlab-token' => 'GitLab Token',
        'gitlab-oauth' => 'GitLab OAuth',
        'bitbucket-oauth' => 'Bitbucket OAuth',
        'forgejo-token' => 'Forgejo Token',
        'custom-headers' => 'Custom Header',
    ];

    public function __construct(
        private readonly ComposerService $composerService,
    ) {}

    /**
     * List configured repositories from composer.json
     *
     * @return list<array{name: string, type: string, url: string}>
     */
    public function listRepositories(): array
    {
        $composerJsonPath = Environment::getProjectPath() . '/composer.json';
        if (!file_exists($composerJsonPath)) {
            return [];
        }

        $content = file_get_contents($composerJsonPath);
        if ($content === false) {
            return [];
        }

        $data = json_decode($content, true);
        if (!is_array($data) || !isset($data['repositories'])) {
            return [];
        }

        $repos = [];
        foreach ($data['repositories'] as $key => $repo) {
            if (!is_array($repo)) {
                continue;
            }
            // composer writes repositories either keyed by name
            // ({"my-repo": {...}}) or as an array entry with a "name" field
            // ([{"name": "my-repo", ...}]). Accept both, preferring the
            // string key when present.
            $name = is_string($key) ? $key : (is_string($repo['name'] ?? null) ? $repo['name'] : (string)$key);
            $repos[] = [
                'name' => $name,
                'type' => $repo['type'] ?? 'unknown',
                'url' => $repo['url'] ?? '',
            ];
        }

        return $repos;
    }

    /**
     * Add a repository to composer.json
     *
     * Uses: composer config repositories.<name> <type> <url>
     */
    public function addRepository(string $name, string $type, string $url): ComposerResult
    {
        $binary = $this->composerService->resolveComposerBinary();

        $process = new Process(
            [$binary, 'config', 'repositories.' . $name, $type, $url, '--no-interaction', '--no-ansi'],
            Environment::getProjectPath(),
            $this->getEnvironment()
        );
        $process->setTimeout(self::COMMAND_TIMEOUT);
        $process->run();

        return new ComposerResult(
            success: $process->isSuccessful(),
            output: $process->getOutput(),
            errorOutput: $process->getErrorOutput(),
            exitCode: $process->getExitCode() ?? 1,
            isDryRun: false,
            command: 'composer config repositories.' . $name . ' ' . $type . ' ' . $url,
        );
    }

    /**
     * Remove a repository from composer.json
     *
     * First tries `composer config --unset repositories.<name>` (works when
     * composer.json uses the keyed object form). If composer reports the
     * entry was not found, falls back to rewriting composer.json directly
     * to handle the alternative array form where the name is carried on
     * a "name" field inside the entry.
     */
    public function removeRepository(string $name): ComposerResult
    {
        $binary = $this->composerService->resolveComposerBinary();

        $process = new Process(
            [$binary, 'config', '--unset', 'repositories.' . $name, '--no-interaction', '--no-ansi'],
            Environment::getProjectPath(),
            $this->getEnvironment()
        );
        $process->setTimeout(self::COMMAND_TIMEOUT);
        $process->run();

        if ($process->isSuccessful()) {
            return new ComposerResult(
                success: true,
                output: $process->getOutput(),
                errorOutput: $process->getErrorOutput(),
                exitCode: 0,
                isDryRun: false,
                command: 'composer config --unset repositories.' . $name,
            );
        }

        // Fallback: manually rewrite composer.json for array-form entries.
        $rewrittenCount = $this->removeRepositoryFromComposerJson($name);
        if ($rewrittenCount > 0) {
            return new ComposerResult(
                success: true,
                output: sprintf('Removed %d repository entry matching "%s" from composer.json', $rewrittenCount, $name),
                errorOutput: '',
                exitCode: 0,
                isDryRun: false,
                command: 'composer config --unset repositories.' . $name,
            );
        }

        return new ComposerResult(
            success: false,
            output: $process->getOutput(),
            errorOutput: $process->getErrorOutput(),
            exitCode: $process->getExitCode() ?? 1,
            isDryRun: false,
            command: 'composer config --unset repositories.' . $name,
        );
    }

    /**
     * Remove any repository entry matching the given name from composer.json.
     *
     * Handles both the keyed object form ({"my-repo": {...}}) and the array
     * form with a "name" field ([{"name": "my-repo", ...}]).
     *
     * @return int number of entries removed
     */
    private function removeRepositoryFromComposerJson(string $name): int
    {
        $composerJsonPath = Environment::getProjectPath() . '/composer.json';
        if (!file_exists($composerJsonPath)) {
            return 0;
        }
        $content = file_get_contents($composerJsonPath);
        if ($content === false) {
            return 0;
        }
        $data = json_decode($content, true);
        if (!is_array($data) || !isset($data['repositories']) || !is_array($data['repositories'])) {
            return 0;
        }

        $originalCount = count($data['repositories']);
        $filtered = [];
        foreach ($data['repositories'] as $key => $repo) {
            $matchesByKey = is_string($key) && $key === $name;
            $matchesByField = is_array($repo) && isset($repo['name']) && $repo['name'] === $name;
            if ($matchesByKey || $matchesByField) {
                continue;
            }
            if (is_string($key)) {
                $filtered[$key] = $repo;
            } else {
                $filtered[] = $repo;
            }
        }

        $removed = $originalCount - count($filtered);
        if ($removed === 0) {
            return 0;
        }

        $data['repositories'] = $filtered;
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return 0;
        }
        file_put_contents($composerJsonPath, $json . "\n");
        return $removed;
    }

    /**
     * List configured authentication entries
     *
     * Reads auth.json from project root. NEVER returns actual credentials,
     * only whether auth is configured for each host.
     *
     * @return list<array{host: string, type: string}>
     */
    public function listAuth(): array
    {
        $authJsonPath = Environment::getProjectPath() . '/auth.json';
        if (!file_exists($authJsonPath)) {
            return [];
        }

        $content = file_get_contents($authJsonPath);
        if ($content === false) {
            return [];
        }

        $data = json_decode($content, true);
        if (!is_array($data)) {
            return [];
        }

        $authEntries = [];

        foreach (self::AUTH_TYPE_LABELS as $key => $label) {
            if (isset($data[$key]) && is_array($data[$key])) {
                foreach (array_keys($data[$key]) as $host) {
                    $authEntries[] = [
                        'host' => (string)$host,
                        'type' => $label,
                    ];
                }
            }
        }

        return $authEntries;
    }

    /**
     * Set authentication for a host
     *
     * Uses: composer config <auth-type>.<host> <credentials...>
     * Stored in auth.json in the project root.
     *
     * @param array<string, mixed> $credentials Key-value pairs depending on auth type
     */
    public function setAuth(string $type, string $host, array $credentials): ComposerResult
    {
        $binary = $this->composerService->resolveComposerBinary();

        $args = [$binary, 'config'];

        switch ($type) {
            case 'http-basic':
                $args[] = 'http-basic.' . $host;
                $args[] = $credentials['username'] ?? '';
                $args[] = $credentials['password'] ?? '';
                break;
            case 'bearer':
                $args[] = 'bearer.' . $host;
                $args[] = $credentials['token'] ?? '';
                break;
            case 'github-oauth':
                $args[] = 'github-oauth.' . $host;
                $args[] = $credentials['token'] ?? '';
                break;
            case 'gitlab-token':
                $args[] = 'gitlab-token.' . $host;
                $args[] = $credentials['token'] ?? '';
                break;
            case 'gitlab-oauth':
                $args[] = 'gitlab-oauth.' . $host;
                $args[] = $credentials['token'] ?? '';
                break;
            case 'bitbucket-oauth':
                $args[] = 'bitbucket-oauth.' . $host;
                $args[] = $credentials['consumer-key'] ?? '';
                $args[] = $credentials['consumer-secret'] ?? '';
                break;
            case 'forgejo-token':
                $args[] = 'forgejo-token.' . $host;
                $args[] = $credentials['username'] ?? '';
                $args[] = $credentials['token'] ?? '';
                break;
            case 'custom-headers':
                $args[] = 'custom-headers.' . $host;
                $headers = $credentials['headers'] ?? [];
                if (is_array($headers)) {
                    foreach ($headers as $header) {
                        if (!is_array($header)) {
                            continue;
                        }
                        $name = trim((string)($header['name'] ?? ''));
                        $value = (string)($header['value'] ?? '');
                        if ($name !== '') {
                            $args[] = $name . ': ' . $value;
                        }
                    }
                }
                break;
            default:
                return new ComposerResult(
                    success: false,
                    output: '',
                    errorOutput: 'Unknown auth type: ' . $type,
                    exitCode: 1,
                    isDryRun: false,
                );
        }

        $args[] = '--no-interaction';
        $args[] = '--no-ansi';

        // Build display command — mask credentials
        $displayCommand = 'composer config ' . $type . '.' . $host . ' ***';

        $process = new Process(
            $args,
            Environment::getProjectPath(),
            $this->getEnvironment()
        );
        $process->setTimeout(self::COMMAND_TIMEOUT);
        $process->run();

        return new ComposerResult(
            success: $process->isSuccessful(),
            output: $process->getOutput(),
            errorOutput: $process->getErrorOutput(),
            exitCode: $process->getExitCode() ?? 1,
            isDryRun: false,
            command: $displayCommand,
        );
    }

    /**
     * Remove authentication for a host
     */
    public function removeAuth(string $type, string $host): ComposerResult
    {
        $binary = $this->composerService->resolveComposerBinary();

        $configKey = $this->resolveAuthConfigKey($type);
        if ($configKey === null) {
            return new ComposerResult(
                success: false,
                output: '',
                errorOutput: 'Unknown auth type: ' . $type,
                exitCode: 1,
                isDryRun: false,
            );
        }

        $process = new Process(
            [$binary, 'config', '--unset', $configKey . '.' . $host, '--no-interaction', '--no-ansi'],
            Environment::getProjectPath(),
            $this->getEnvironment()
        );
        $process->setTimeout(self::COMMAND_TIMEOUT);
        $process->run();

        return new ComposerResult(
            success: $process->isSuccessful(),
            output: $process->getOutput(),
            errorOutput: $process->getErrorOutput(),
            exitCode: $process->getExitCode() ?? 1,
            isDryRun: false,
            command: 'composer config --unset ' . $configKey . '.' . $host,
        );
    }

    /**
     * Resolve a display type label or raw key to the composer config key
     */
    private function resolveAuthConfigKey(string $displayType): ?string
    {
        // Accept both raw keys and display labels
        if (isset(self::AUTH_TYPE_LABELS[$displayType])) {
            return $displayType;
        }

        $flipped = array_flip(self::AUTH_TYPE_LABELS);
        return $flipped[$displayType] ?? null;
    }

    /**
     * Get HTTP auth headers for a URL based on auth.json configuration.
     *
     * Reads the project-level auth.json and returns appropriate HTTP headers
     * for the URL's host. For internal use — never expose raw credentials to frontend.
     *
     * @return array<string, string> HTTP headers for authentication
     */
    public function getAuthHeadersForUrl(string $url): array
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (!is_string($host) || $host === '') {
            return [];
        }

        $authJsonPath = Environment::getProjectPath() . '/auth.json';
        if (!file_exists($authJsonPath)) {
            return [];
        }

        $content = file_get_contents($authJsonPath);
        if ($content === false) {
            return [];
        }

        $data = json_decode($content, true);
        if (!is_array($data)) {
            return [];
        }

        if (isset($data['http-basic'][$host]) && is_array($data['http-basic'][$host])) {
            $username = (string)($data['http-basic'][$host]['username'] ?? '');
            $password = (string)($data['http-basic'][$host]['password'] ?? '');
            return ['Authorization' => 'Basic ' . base64_encode($username . ':' . $password)];
        }

        if (isset($data['bearer'][$host]) && is_string($data['bearer'][$host])) {
            return ['Authorization' => 'Bearer ' . $data['bearer'][$host]];
        }

        if (isset($data['gitlab-token'][$host]) && is_string($data['gitlab-token'][$host])) {
            return ['PRIVATE-TOKEN' => $data['gitlab-token'][$host]];
        }

        if (isset($data['gitlab-oauth'][$host]) && is_string($data['gitlab-oauth'][$host])) {
            return ['Authorization' => 'Bearer ' . $data['gitlab-oauth'][$host]];
        }

        if (isset($data['github-oauth'][$host]) && is_string($data['github-oauth'][$host])) {
            return ['Authorization' => 'token ' . $data['github-oauth'][$host]];
        }

        return [];
    }

    /**
     * @return array<string, string>
     */
    private function getEnvironment(): array
    {
        $env = [];
        $composerHome = getenv('COMPOSER_HOME');
        if ($composerHome === false) {
            $env['COMPOSER_HOME'] = Environment::getVarPath() . '/composer';
        }
        $env['NO_COLOR'] = '1';
        return $env;
    }
}
