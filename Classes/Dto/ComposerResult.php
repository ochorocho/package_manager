<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Dto;

/**
 * Data transfer object for composer operation results
 */
readonly class ComposerResult
{
    public function __construct(
        public bool $success,
        public string $output,
        public string $errorOutput,
        public int $exitCode,
        public bool $isDryRun,
        public string $command = '',
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'success' => $this->success,
            'output' => $this->output,
            'errorOutput' => $this->errorOutput,
            'exitCode' => $this->exitCode,
            'isDryRun' => $this->isDryRun,
            'command' => $this->command,
        ];
    }
}
