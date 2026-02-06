<?php

declare(strict_types=1);

defined('TYPO3') or die();

// Register cache for Packagist API responses
$GLOBALS['TYPO3_CONF_VARS']['SYS']['caching']['cacheConfigurations']['package_manager'] ??= [];
$GLOBALS['TYPO3_CONF_VARS']['SYS']['caching']['cacheConfigurations']['package_manager']['backend'] ??=
    \TYPO3\CMS\Core\Cache\Backend\FileBackend::class;
