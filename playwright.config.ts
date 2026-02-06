import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Package Manager extension.
 *
 * Runs against the DDEV project at https://pm.ddev.site.
 * Tests live in Tests/Playwright/e2e and use the local backend fixture
 * defined in Tests/Playwright/fixtures/setup-fixtures.ts.
 */
export default defineConfig({
    testDir: './Tests/Playwright/e2e',
    globalSetup: './Tests/Playwright/global-setup.ts',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 1,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://pm.ddev.site',
        ignoreHTTPSErrors: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
