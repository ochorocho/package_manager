<?php

declare(strict_types=1);

use Ochorocho\PackageManager\Controller\PackageManagerController;
use TYPO3\CMS\Backend\Security\SudoMode\Access\AccessLifetime;

return [
    'package_manager' => [
        'parent' => 'system',
        'access' => 'systemMaintainer',
        'path' => '/module/system/package-manager',
        'iconIdentifier' => 'module-package-manager',
        'labels' => 'LLL:EXT:package_manager/Resources/Private/Language/locallang_mod.xlf',
        'routes' => [
            '_default' => [
                'target' => PackageManagerController::class . '::handleRequest',
            ],
        ],
        'routeOptions' => [
            'sudoMode' => [
                'group' => 'systemMaintainer',
                'lifetime' => AccessLifetime::medium,
            ],
        ],
    ],
];
