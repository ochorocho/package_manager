<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    die('This script supports command line usage only. Please check your command.');
}

$config = \TYPO3\CodingStandards\CsFixerConfig::create();
$config
    ->getFinder()
    ->in(__DIR__ . '/../Classes')
    ->in(__DIR__ . '/../Configuration')
    ->in(__DIR__ . '/../Tests');

return $config;
