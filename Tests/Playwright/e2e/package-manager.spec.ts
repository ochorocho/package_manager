import { test, expect } from '../fixtures/setup-fixtures';

/**
 * E2E smoke tests for the Package Manager backend module.
 *
 * Assertions are kept deliberately loose (regex text matchers, role queries)
 * so they survive small wording changes during the upcoming refactor. The
 * more specific flows are covered in their own spec files.
 */
test.describe('Package Manager module', () => {
    test.beforeEach(async ({ backend }) => {
        await backend.openPackageManager();
    });

    test('Module loads and shows all tabs', async ({ backend }) => {
        const pm = backend.contentFrame.locator('typo3-package-manager');
        await expect(pm).toBeVisible();

        for (const name of [
            /Installed Packages/i,
            /Search Registry/i,
            /Composer Info/i,
            /Dependency Tree/i,
            /Repositories/i,
        ]) {
            await expect(backend.contentFrame.getByRole('tab', { name })).toBeVisible();
        }
    });

    test('Installed tab paints quickly and lists at least one package', async ({ backend }) => {
        // The installed list is now served from `vendor/composer/installed.json`
        // only. The slow `composer outdated` check has moved to a separate
        // background request so the card + first row should be on screen
        // well before the outdated call finishes.
        await expect(
            backend.contentFrame.locator('.card-title', { hasText: /Installed Packages/i })
        ).toBeVisible({ timeout: 3000 });

        const rows = backend.contentFrame.locator(
            '.card:has(.card-title:text-matches("Installed Packages")) tbody tr'
        );
        await expect(rows.first()).toBeVisible({ timeout: 3000 });
    });

    test('Search input enforces minimum length hint', async ({ backend }) => {
        await backend.contentFrame.getByRole('tab', { name: /Search Registry/i }).click();

        const searchInput = backend.contentFrame.locator('input[type="search"]');
        await expect(searchInput).toBeVisible();
        await expect(searchInput).toHaveAttribute('placeholder', /Search packages across all repositories/i);

        const hint = backend.contentFrame.locator('small.text-muted', {
            hasText: /Enter at least 2 characters/i,
        });
        await searchInput.fill('a');
        await expect(hint).toBeVisible();

        await searchInput.fill('te');
        await expect(hint).toBeHidden();
    });

    test('Composer Info tab renders diagnostics cards', async ({ backend }) => {
        await backend.contentFrame.getByRole('tab', { name: /Composer Info/i }).click();

        // Composer Info hits the local composer process — slow on a cold cache.
        await expect(
            backend.contentFrame.locator('.card-title', { hasText: /Composer Binary/i })
        ).toBeVisible({ timeout: 60000 });
        await expect(backend.contentFrame.locator('text=PHP Version')).toBeVisible();
        await expect(
            backend.contentFrame.locator('.card-title', { hasText: /Diagnostics/i })
        ).toBeVisible();
    });

    test('Composer Info tab lists protected packages', async ({ backend }) => {
        await backend.contentFrame.getByRole('tab', { name: /Composer Info/i }).click();

        await expect(
            backend.contentFrame.locator('.card-title', { hasText: /Protected Packages/i })
        ).toBeVisible({ timeout: 30000 });
        await expect(
            backend.contentFrame.locator('.badge', { hasText: 'typo3/cms-core' })
        ).toBeVisible({ timeout: 30000 });
    });

    test('Refresh button stays functional', async ({ backend }) => {
        const refresh = backend.contentFrame.getByRole('button', { name: /Refresh/i });
        await expect(refresh).toBeVisible();
        await refresh.click();

        await expect(backend.contentFrame.locator('typo3-package-manager')).toBeVisible();
    });

    test('Tab switching toggles the active state', async ({ backend }) => {
        const installed = backend.contentFrame.getByRole('tab', { name: /Installed Packages/i });
        const composer = backend.contentFrame.getByRole('tab', { name: /Composer Info/i });

        await expect(installed).toHaveClass(/active/);
        await composer.click();
        await expect(composer).toHaveClass(/active/);
        await expect(installed).not.toHaveClass(/active/);

        await installed.click();
        await expect(installed).toHaveClass(/active/);
        await expect(composer).not.toHaveClass(/active/);
    });
});
