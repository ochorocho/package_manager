import { test, expect } from '../fixtures/setup-fixtures';

/**
 * Exercises the Repositories tab: add a composer repository, confirm it
 * appears in the list, then remove it. No network calls are issued — the
 * repository operations only mutate `composer.json` on the server.
 */
test.describe('Package Manager repositories', () => {
    const repoName = `e2e-repo-${Date.now()}`;
    const repoUrl = 'https://example.com/composer';

    test.beforeEach(async ({ backend }) => {
        await backend.openPackageManager();
        await backend.contentFrame.getByRole('tab', { name: /Repositories/i }).click();
        await expect(
            backend.contentFrame.locator('.card-title', { hasText: /Configured Repositories/i })
        ).toBeVisible({ timeout: 15000 });
    });

    test('Add a composer repository and remove it again', async ({ backend }) => {
        // Open the Add Repository modal
        await backend.contentFrame.getByRole('button', { name: /Add Repository/i }).click();

        const modal = backend.modal.locator;
        await expect(modal).toBeVisible({ timeout: 10000 });

        await modal.locator('#repo-name').fill(repoName);
        await modal.locator('#repo-type').selectOption('composer');
        await modal.locator('#repo-url').fill(repoUrl);
        await backend.modal.click({ name: /Add Repository/i });
        await expect(modal).toBeHidden({ timeout: 15000 });

        // Repository should appear in the list
        const row = backend.contentFrame.locator('tr', { hasText: repoName });
        await expect(row).toBeVisible({ timeout: 15000 });
        await expect(row).toContainText(repoUrl);

        // Remove: click the row's remove icon → confirm in the modal.
        await row.locator('button[title="Remove repository"]').click();
        await expect(modal).toBeVisible({ timeout: 10000 });
        await expect(modal).toContainText(repoName);
        await backend.modal.click({ name: /^Remove$/i });
        await expect(modal).toBeHidden({ timeout: 15000 });
        await expect(row).toBeHidden({ timeout: 15000 });
    });
});
