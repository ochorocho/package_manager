import { test, expect } from '../fixtures/setup-fixtures';

/**
 * Exercises the Authentication section of the Repositories tab. Covers a
 * representative subset of auth types (http-basic, bearer, gitlab-oauth) to
 * make sure the dynamic form field swap keeps working. Credentials are
 * stored in `auth.json` on the server and never displayed back to the UI.
 */
test.describe('Package Manager auth types', () => {
    const host = (slug: string) => `e2e-${slug}-${Date.now()}.example.com`;

    test.beforeEach(async ({ backend }) => {
        await backend.openPackageManager();
        await backend.contentFrame.getByRole('tab', { name: /Repositories/i }).click();
        await expect(
            backend.contentFrame.locator('.card-title', { hasText: /Authentication/i })
        ).toBeVisible({ timeout: 15000 });
    });

    const configure = async (
        backend: import('../fixtures/setup-fixtures').BackendHelper,
        slug: string,
        typeValue: string,
        fields: Record<string, string>
    ): Promise<string> => {
        await backend.contentFrame.getByRole('button', { name: /Add Credentials/i }).click();
        const modal = backend.modal.locator;
        await expect(modal).toBeVisible({ timeout: 10000 });
        // The modal hosts a `<typo3-package-manager-auth-form>` Lit element
        // — wait for its first render to commit before interacting.
        // The modal hosts a `<typo3-package-manager-auth-form>` Lit element.
        // Wait for its `<select#auth-type>` to appear instead of the host
        // element itself, which uses a light-DOM render root and may report
        // 0x0 dimensions before its first render commits.
        const typeSelect = modal.locator('#auth-type');
        await expect(typeSelect).toBeVisible({ timeout: 10000 });

        const testHost = host(slug);
        await typeSelect.selectOption(typeValue);
        await modal.locator('#auth-host').fill(testHost);
        for (const [key, value] of Object.entries(fields)) {
            const field = modal.locator(`.auth-field[data-key="${key}"]`);
            await expect(field).toBeVisible({ timeout: 5000 });
            await field.fill(value);
        }
        await backend.modal.click({ name: /Save Credentials/i });
        await expect(modal).toBeHidden({ timeout: 15000 });

        const row = backend.contentFrame.locator('tr', { hasText: testHost });
        await expect(row).toBeVisible({ timeout: 15000 });
        return testHost;
    };

    test('Configure http-basic auth', async ({ backend }) => {
        await configure(backend, 'basic', 'http-basic', {
            username: 'e2e-user',
            password: 'e2e-secret',
        });
    });

    test('Configure bearer token auth', async ({ backend }) => {
        await configure(backend, 'bearer', 'bearer', {
            token: 'e2e-bearer-token',
        });
    });

    test('Configure gitlab-oauth auth', async ({ backend }) => {
        await configure(backend, 'gitlab', 'gitlab-oauth', {
            token: 'e2e-gitlab-token',
        });
    });
});
