import { test as base, expect, FrameLocator, Locator, Page } from '@playwright/test';

/**
 * Minimal TYPO3 backend fixture for Playwright e2e tests.
 *
 * A single browser context is reused across all tests in a worker. This
 * keeps login cookies + sudo-mode grant alive, so we don't have to verify
 * sudo for every test — which is both slow and historically flaky when
 * the sudo modal races with the Lit render.
 *
 * Credentials come from env vars with sensible DDEV defaults:
 *   TYPO3_BE_USER=admin
 *   TYPO3_BE_PASSWORD=Password.1
 */

const BE_USER = process.env.TYPO3_BE_USER ?? 'admin';
const BE_PASSWORD = process.env.TYPO3_BE_PASSWORD ?? 'Password.1';

export interface BackendModalHelper {
    locator: Locator;
    click(options: { name: string | RegExp }): Promise<void>;
}

export class BackendHelper {
    public readonly contentFrame: FrameLocator;
    public readonly modal: BackendModalHelper;

    constructor(public readonly page: Page) {
        this.contentFrame = page.frameLocator('iframe[name="list_frame"]');
        const modalLocator = page.locator('typo3-backend-modal > dialog');
        this.modal = {
            locator: modalLocator,
            click: async ({ name }) => {
                // Prefer footer buttons over the header close (X) button,
                // which shares the accessible name of the dialog title in
                // TYPO3's modal component.
                const footerMatch = modalLocator
                    .locator('.modal-footer')
                    .getByRole('button', { name });
                if (await footerMatch.first().isVisible().catch(() => false)) {
                    await footerMatch.first().click();
                    return;
                }
                await modalLocator.getByRole('button', { name }).last().click();
            },
        };
    }

    async login(): Promise<void> {
        await this.page.goto('/typo3/', { waitUntil: 'domcontentloaded' });

        const alreadyLoggedIn = await this.page
            .locator('typo3-backend-module-menu, [data-modulemenu-identifier]')
            .first()
            .isVisible()
            .catch(() => false);
        if (alreadyLoggedIn) {
            return;
        }

        await this.page.locator('input[name="username"]').fill(BE_USER);
        // TYPO3 backend login uses a visible "p_field" input; the hidden
        // "userident" field is populated on submit.
        await this.page.locator('input[name="p_field"]').fill(BE_PASSWORD);
        await this.page.locator('button[type="submit"], input[type="submit"]').first().click();

        await this.page.waitForURL('**/typo3/main**', { timeout: 20000 }).catch(() => {});
        await expect(
            this.page.locator('typo3-backend-module-menu, [data-modulemenu-identifier]').first()
        ).toBeVisible({ timeout: 20000 });
    }

    async gotoModule(identifier: string): Promise<void> {
        const moduleLink = this.page
            .locator(`[data-modulemenu-identifier="${identifier}"]`)
            .first();
        // TYPO3 remembers the last-visited module across sessions, which
        // can mean our target lives inside a collapsed submenu (e.g. the
        // System group). The menu item is still in the DOM with the
        // correct href — navigate directly instead of chasing the menu
        // open/close animation.
        await expect(moduleLink).toBeAttached({ timeout: 10000 });
        const href = await moduleLink.getAttribute('href');
        if (href) {
            await this.page.goto(href, { waitUntil: 'domcontentloaded' });
        } else {
            await moduleLink.click({ force: true });
        }
        await expect(this.page.locator('iframe[name="list_frame"]')).toBeVisible({
            timeout: 10000,
        });
    }

    /**
     * Handle the TYPO3 sudo-mode verification modal if it appears.
     */
    async verifySudoMode(password: string = BE_PASSWORD): Promise<void> {
        const modalBody = this.modal.locator;
        try {
            await expect(modalBody).toBeVisible({ timeout: 5000 });
            await expect(modalBody).toContainText(/Verify|password/i);
            await modalBody.locator('input[type="password"]').fill(password);
            await this.modal.click({ name: /verify/i });
            await expect(modalBody).toBeHidden({ timeout: 10000 });
        } catch {
            // No sudo modal — already verified in this session.
        }
    }

    /**
     * Open the Package Manager module and wait for it to be interactive.
     * Reset to the Installed Packages tab if we've been somewhere else.
     */
    async openPackageManager(): Promise<void> {
        await this.gotoModule('package_manager');
        await this.verifySudoMode();
        await expect(this.contentFrame.locator('typo3-package-manager')).toBeVisible({
            timeout: 20000,
        });
        // Wait for the custom element to upgrade and its first Lit render
        // to commit. At that point the nav-tabs children are in the DOM.
        await this.contentFrame.locator('typo3-package-manager').evaluate(
            async (el: Element) => {
                await customElements.whenDefined('typo3-package-manager');
                const lit = el as unknown as { updateComplete?: Promise<unknown> };
                if (lit.updateComplete) {
                    await lit.updateComplete;
                }
            }
        );
        const installedTab = this.contentFrame.locator(
            'button.nav-link:has-text("Installed")'
        );
        await expect(installedTab).toBeVisible({ timeout: 20000 });
        // Always start tests from the Installed tab so per-spec beforeEach
        // hooks can assume a known starting state.
        if (!(await installedTab.evaluate((el) => el.classList.contains('active')))) {
            await installedTab.click();
        }
    }
}

type Fixtures = {
    backend: BackendHelper;
};

/**
 * Each test gets its own fresh browser context. Login + sudo verification
 * run in every test, which costs a few seconds but keeps isolation clean
 * and avoids stale UI state bleeding between tests.
 */
export const test = base.extend<Fixtures>({
    backend: async ({ page }, use) => {
        const helper = new BackendHelper(page);
        await helper.login();
        await use(helper);
    },
});

export { expect };
