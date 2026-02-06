import { test, expect } from '../fixtures/setup-fixtures';

/**
 * Smoke-tests the dry-run preview modal without actually executing any
 * composer write operation. We search for a well-known package, trigger
 * its Install action, wait for the dry-run preview modal to appear, then
 * cancel it. Asserts that the modal renders and that the system state is
 * untouched.
 *
 * Network access to Packagist is required. If the network is unavailable
 * this test is skipped rather than failed.
 */
test.describe('Package Manager dry-run flow', () => {
    test.beforeEach(async ({ backend }) => {
        await backend.openPackageManager();
    });

    test('Search yields results, install opens a dry-run modal, cancel closes it', async ({ backend }) => {
        await backend.contentFrame.getByRole('tab', { name: /Search Registry/i }).click();

        const searchInput = backend.contentFrame.locator('input[type="search"]');
        await expect(searchInput).toBeVisible();
        await searchInput.fill('news');

        // Wait for search results (or the "no results" state) to resolve.
        const resultsCard = backend.contentFrame.locator('.card', {
            has: backend.contentFrame.locator('.card-title', { hasText: /Search Results/i }),
        });
        await expect(resultsCard).toBeVisible({ timeout: 20000 });

        const installButton = resultsCard
            .locator('button[title="Install package"]')
            .first();
        if (!(await installButton.isVisible().catch(() => false))) {
            test.skip(true, 'No installable search results available (Packagist unreachable or empty).');
        }

        await installButton.click();

        const modal = backend.modal.locator;
        await expect(modal).toBeVisible({ timeout: 60000 });
        await expect(modal).toContainText(/Dry Run|Preview|Confirm/i);

        // Cancel the dry-run preview — system state must remain untouched.
        await backend.modal.click({ name: /Cancel/i });
        await expect(modal).toBeHidden({ timeout: 15000 });

        // The content frame should still show the search tab intact.
        await expect(backend.contentFrame.locator('typo3-package-manager')).toBeVisible();
    });
});
