/*
 * This file is part of the TYPO3 CMS project.
 *
 * It is free software; you can redistribute it and/or modify it under
 * the terms of the GNU General Public License, either version 2
 * of the License, or any later version.
 *
 * For the full copyright and license information, please read the
 * LICENSE.txt file that was distributed with this source code.
 *
 * The TYPO3 project - inspiring people to share!
 */

import { html, LitElement } from 'lit';
import Notification from '@typo3/backend/notification.js';
import '@typo3/backend/element/icon-element.js';
import '@typo3/backend/element/spinner-element.js';
import labels from '~labels/package_manager.module';
import { clearCaches } from '@typo3/package-manager/api/composer-api.js';
import { EVENTS, TAB_IDS } from '@typo3/package-manager/util/constants.js';
import { isBusy } from '@typo3/package-manager/util/operation-runner.js';
// Side-effect imports — register the per-tab child custom elements.
import '@typo3/package-manager/component/composer-info.js';
import '@typo3/package-manager/component/dependency-tree.js';
import '@typo3/package-manager/component/installed-list.js';
import '@typo3/package-manager/component/repositories-panel.js';
import '@typo3/package-manager/component/search-panel.js';

/**
 * `<typo3-package-manager>` — shell custom element for the Package
 * Manager backend module.
 *
 * Owns only the active tab id and the "refresh everything" button. Each
 * tab is a child custom element that loads + manages its own data. Cross-
 * tab coordination happens via `typo3:package-manager:*` events on
 * `document` — defined in util/constants.js.
 */
export class PackageManager extends LitElement {
    static properties = {
        activeTab: { type: String, state: true },
    };

    constructor() {
        super();
        this.activeTab = TAB_IDS.INSTALLED;
    }

    createRenderRoot() {
        // Light DOM — inherits TYPO3 backend Bootstrap styles.
        return this;
    }

    async handleRefresh() {
        try {
            await clearCaches();
            // Tell every child component to re-fetch.
            document.dispatchEvent(new CustomEvent(EVENTS.OPERATION_COMPLETED, {
                detail: { success: true, kind: 'refresh' },
            }));
            Notification.success(labels.get('notification.success'), labels.get('shell.refresh.success'));
        } catch (error) {
            Notification.error(labels.get('notification.error'), labels.get('shell.refresh.error'));
        }
    }

    render() {
        return html`
            <div class="package-manager">
                ${this.renderHeader()}
                ${this.renderContent()}
            </div>
        `;
    }

    renderHeader() {
        return html`
            <div class="package-manager-header mb-3">
                <div class="d-flex justify-content-between align-items-center">
                    <ul class="nav nav-tabs mb-0" role="tablist">
                        ${this.renderTab(TAB_IDS.INSTALLED, 'actions-folder', labels.get('tab.installed'))}
                        ${this.renderTab(TAB_IDS.SEARCH, 'actions-search', labels.get('tab.search'))}
                        ${this.renderTab(TAB_IDS.COMPOSER, 'actions-package', labels.get('tab.composer'))}
                        ${this.renderTab(TAB_IDS.DEPENDENCIES, 'actions-pagetree-mount', labels.get('tab.dependencies'))}
                        ${this.renderTab(TAB_IDS.REPOSITORIES, 'actions-database', labels.get('tab.repositories'))}
                    </ul>
                    <div>
                        <button type="button" class="btn btn-default btn-sm" title="${labels.get('shell.refresh.title')}"
                            @click=${() => this.handleRefresh()} ?disabled=${isBusy()}>
                            <typo3-backend-icon identifier="actions-refresh" size="small"></typo3-backend-icon>
                            ${labels.get('shell.refresh')}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    renderTab(id, icon, label) {
        return html`
            <li class="nav-item" role="presentation">
                <button class="nav-link ${this.activeTab === id ? 'active' : ''}"
                    type="button" role="tab"
                    @click=${() => { this.activeTab = id; }}>
                    <typo3-backend-icon identifier="${icon}" size="small"></typo3-backend-icon>
                    ${label}
                </button>
            </li>
        `;
    }

    renderContent() {
        switch (this.activeTab) {
            case TAB_IDS.SEARCH:
                return html`<typo3-package-manager-search-panel></typo3-package-manager-search-panel>`;
            case TAB_IDS.COMPOSER:
                return html`<div class="tab-content"><typo3-package-manager-composer-info></typo3-package-manager-composer-info></div>`;
            case TAB_IDS.DEPENDENCIES:
                return html`<div class="tab-content"><typo3-package-manager-dependency-tree></typo3-package-manager-dependency-tree></div>`;
            case TAB_IDS.REPOSITORIES:
                return html`<typo3-package-manager-repositories></typo3-package-manager-repositories>`;
            case TAB_IDS.INSTALLED:
            default:
                return html`<typo3-package-manager-installed-list></typo3-package-manager-installed-list>`;
        }
    }
}

customElements.define('typo3-package-manager', PackageManager);
