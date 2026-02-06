<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Service;

use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

/**
 * Service for managing protected packages that cannot be removed
 *
 * Some packages are essential for TYPO3 to function and should never be removed
 * via the Package Manager. This service maintains that list.
 */
class PackageProtectionService
{
    /**
     * Packages that are always protected (core system packages)
     */
    private const ALWAYS_PROTECTED = [
        'typo3/cms-core',
        'typo3/cms-backend',
        'typo3/cms-frontend',
        'typo3/cms-extbase',
        'typo3/cms-fluid',
        'typo3/cms-install',
        'typo3/cms-composer-installers',
        'typo3/class-alias-loader',
    ];

    public function __construct(
        private readonly ExtensionConfiguration $extensionConfiguration,
    ) {}

    /**
     * Check if a package is protected and cannot be removed
     */
    public function isProtected(string $packageName): bool
    {
        return in_array($packageName, $this->getProtectedPackages(), true);
    }

    /**
     * Get all protected package names
     *
     * @return list<string>
     */
    public function getProtectedPackages(): array
    {
        $protected = self::ALWAYS_PROTECTED;

        // Add packages from extension configuration
        $additionalProtected = $this->getAdditionalProtectedPackages();
        if (!empty($additionalProtected)) {
            $protected = array_merge($protected, $additionalProtected);
        }

        return array_values(array_unique($protected));
    }

    /**
     * Get additional protected packages from extension configuration
     *
     * @return list<string>
     */
    private function getAdditionalProtectedPackages(): array
    {
        try {
            $config = $this->extensionConfiguration->get('package_manager');
            $protectedString = $config['protectedPackages'] ?? '';

            if (empty($protectedString)) {
                return [];
            }

            // Split by comma and clean up each entry
            $packages = array_map(
                fn(string $pkg): string => trim($pkg),
                explode(',', $protectedString)
            );

            // Filter out empty entries
            return array_values(array_filter($packages, fn(string $pkg): bool => $pkg !== ''));
        } catch (\Exception) {
            // Extension configuration might not exist yet
            return [];
        }
    }

    /**
     * Check if a package is always protected (system core package)
     */
    public function isSystemPackage(string $packageName): bool
    {
        return in_array($packageName, self::ALWAYS_PROTECTED, true);
    }

    /**
     * Get the list of always-protected system packages
     *
     * @return list<string>
     */
    public function getSystemPackages(): array
    {
        return self::ALWAYS_PROTECTED;
    }
}
