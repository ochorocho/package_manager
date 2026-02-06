<?php

declare(strict_types=1);

use Ochorocho\PackageManager\Controller\PackageManagerAjaxController;

return [
    'package_manager_installed' => [
        'path' => '/package-manager/installed',
        'target' => PackageManagerAjaxController::class . '::getInstalledPackages',
        'methods' => ['GET'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_outdated' => [
        'path' => '/package-manager/outdated',
        'target' => PackageManagerAjaxController::class . '::getOutdatedPackages',
        'methods' => ['GET'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_search' => [
        'path' => '/package-manager/search',
        'target' => PackageManagerAjaxController::class . '::searchPackages',
        'methods' => ['GET'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_require' => [
        'path' => '/package-manager/require',
        'target' => PackageManagerAjaxController::class . '::requirePackage',
        'methods' => ['POST'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_update' => [
        'path' => '/package-manager/update',
        'target' => PackageManagerAjaxController::class . '::updatePackage',
        'methods' => ['POST'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_remove' => [
        'path' => '/package-manager/remove',
        'target' => PackageManagerAjaxController::class . '::removePackage',
        'methods' => ['POST'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_composer_info' => [
        'path' => '/package-manager/composer-info',
        'target' => PackageManagerAjaxController::class . '::getComposerInfo',
        'methods' => ['GET'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_clear_cache' => [
        'path' => '/package-manager/clear-cache',
        'target' => PackageManagerAjaxController::class . '::clearCache',
        'methods' => ['POST'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_package_info' => [
        'path' => '/package-manager/package-info',
        'target' => PackageManagerAjaxController::class . '::getPackageInfo',
        'methods' => ['GET'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_dependency_tree' => [
        'path' => '/package-manager/dependency-tree',
        'target' => PackageManagerAjaxController::class . '::getDependencyTree',
        'methods' => ['GET'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_suggestions' => [
        'path' => '/package-manager/suggestions',
        'target' => PackageManagerAjaxController::class . '::getPackageSuggestions',
        'methods' => ['GET'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_repositories' => [
        'path' => '/package-manager/repositories',
        'target' => PackageManagerAjaxController::class . '::getRepositories',
        'methods' => ['GET'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_add_repository' => [
        'path' => '/package-manager/add-repository',
        'target' => PackageManagerAjaxController::class . '::addRepository',
        'methods' => ['POST'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_remove_repository' => [
        'path' => '/package-manager/remove-repository',
        'target' => PackageManagerAjaxController::class . '::removeRepository',
        'methods' => ['POST'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_auth_list' => [
        'path' => '/package-manager/auth',
        'target' => PackageManagerAjaxController::class . '::getAuth',
        'methods' => ['GET'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_auth_set' => [
        'path' => '/package-manager/auth/set',
        'target' => PackageManagerAjaxController::class . '::setAuth',
        'methods' => ['POST'],
        'inheritAccessFromModule' => 'package_manager',
    ],
    'package_manager_auth_remove' => [
        'path' => '/package-manager/auth/remove',
        'target' => PackageManagerAjaxController::class . '::removeAuth',
        'methods' => ['POST'],
        'inheritAccessFromModule' => 'package_manager',
    ],
];
