import { html, LitElement, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import '@typo3/backend/element/icon-element.js';
import '@typo3/backend/element/spinner-element.js';
import Notification from '@typo3/backend/notification.js';
import labels from '~labels/package_manager.module';
import {
    fetchInstalledPackages,
    fetchOutdatedPackages,
} from '@typo3/package-manager/api/package-api.js';
import { runOperation, isBusy } from '@typo3/package-manager/util/operation-runner.js';
import { showPackageDetails } from '@typo3/package-manager/util/package-details-modal.js';
import { EVENTS } from '@typo3/package-manager/util/constants.js';

/**
 * `<typo3-package-manager-installed-list>`
 *
 * Shows the list of installed `typo3-cms-extension` packages with per-row
 * Info/Update/Remove buttons. Update availability comes from a separate
 * `/outdated` AJAX call that is kicked off after the initial render — so
 * the table paints immediately while `composer outdated` runs in the
 * background. The subtitle shows a small spinner while that call is in
 * flight.
 *
 * Auto-refreshes after any operation completes by listening for
 * `typo3:package-manager:operation-completed` on `document`.
 */
export class InstalledList extends LitElement {
    static properties = {
        packages: { type: Array, state: true },
        outdated: { type: Object, state: true },
        loading: { type: Boolean, state: true },
        loadingUpdates: { type: Boolean, state: true },
        busy: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this.packages = [];
        this.outdated = {};
        this.loading = false;
        this.loadingUpdates = false;
        this.busy = false;
        this._onOperationCompleted = () => {
            this.busy = false;
            this.refresh();
        };
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener(EVENTS.OPERATION_COMPLETED, this._onOperationCompleted);
        this.refresh();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener(EVENTS.OPERATION_COMPLETED, this._onOperationCompleted);
    }

    async refresh({ force = false } = {}) {
        this.loading = true;
        try {
            const data = await fetchInstalledPackages();
            if (data.status === 'ok') {
                this.packages = data.packages || [];
            }
        } catch (error) {
            console.error('Failed to load installed packages:', error);
            Notification.error(labels.get('notification.error'), labels.get('installed.load.error'));
        } finally {
            this.loading = false;
        }
        this.refreshOutdated({ force });
    }

    async refreshOutdated({ force = false } = {}) {
        this.loadingUpdates = true;
        try {
            const data = await fetchOutdatedPackages({ force });
            if (data.status === 'ok') {
                this.outdated = data.outdated || {};
            }
        } catch (error) {
            console.error('Failed to check for updates:', error);
            Notification.warning(labels.get('notification.warning'), labels.get('installed.updates.error'));
        } finally {
            this.loadingUpdates = false;
        }
    }

    async handleUpdate(packageName) {
        this.busy = true;
        await runOperation('update', packageName, 'Update');
    }

    async handleRemove(packageName) {
        this.busy = true;
        await runOperation('remove', packageName, 'Remove');
    }

    render() {
        if (this.loading && this.packages.length === 0) {
            return html`
                <div class="tab-content text-center py-5">
                    <typo3-backend-spinner size="medium"></typo3-backend-spinner>
                    <p class="mt-2 mb-0 text-muted">${labels.get('installed.loading')}</p>
                </div>
            `;
        }
        const extensions = this.packages.filter(
            (pkg) => pkg.type === 'typo3-cms-extension' || pkg.type === 'typo3-cms-framework'
        );
        return html`
            <div class="tab-content">
                <div class="card">
                    ${this.renderHeader(extensions)}
                    ${extensions.length === 0
                        ? html`<div class="card-body"><p class="text-muted mb-0">${labels.get('installed.empty')}</p></div>`
                        : this.renderTable(extensions)}
                </div>
            </div>
        `;
    }

    renderHeader(extensions) {
        return html`
            <div class="card-header">
                <div class="card-icon">
                    <typo3-backend-icon identifier="actions-folder" size="small"></typo3-backend-icon>
                </div>
                <div class="card-header-body">
                    <h2 class="card-title">${labels.get('installed.card.title')}</h2>
                    <span class="card-subtitle">
                        ${labels.get('installed.card.subtitle', [extensions.length])}
                        ${this.loadingUpdates ? html`
                            <span class="ms-2">
                                <typo3-backend-spinner size="small"></typo3-backend-spinner>
                                <small class="text-muted">${labels.get('installed.updates.checking')}</small>
                            </span>
                        ` : nothing}
                    </span>
                </div>
                <div class="card-header-actions">
                    <button type="button" class="btn btn-default btn-sm"
                        title="${labels.get('installed.updates.button.title')}"
                        @click=${() => this.refreshOutdated({ force: true })}
                        ?disabled=${this.loadingUpdates}>
                        <typo3-backend-icon identifier="actions-refresh" size="small"></typo3-backend-icon>
                        ${labels.get('installed.updates.button')}
                    </button>
                </div>
            </div>
        `;
    }

    renderTable(extensions) {
        return html`
            <div class="table-fit">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>${labels.get('installed.column.package')}</th>
                            <th>${labels.get('installed.column.version')}</th>
                            <th>${labels.get('installed.column.description')}</th>
                            <th class="col-control"><span class="visually-hidden">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${repeat(extensions, (pkg) => pkg.name, (pkg) => this.renderRow(pkg))}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderRow(pkg) {
        const outdatedInfo = this.outdated[pkg.name];
        const hasUpdate = outdatedInfo !== undefined;
        const latestVersion = outdatedInfo?.latest ?? null;
        const disabled = this.busy || isBusy();
        return html`
            <tr>
                <td>
                    <strong>${pkg.name}</strong>
                    ${pkg.isProtected ? html`
                        <span class="badge badge-warning ms-2">
                            <typo3-backend-icon identifier="actions-lock" size="small"></typo3-backend-icon>
                            ${labels.get('installed.badge.protected')}
                        </span>
                    ` : nothing}
                    ${hasUpdate ? html`
                        <span class="badge badge-info ms-2"
                            title="${labels.get('installed.badge.update.title', [latestVersion])}">
                            <typo3-backend-icon identifier="actions-arrow-up" size="small"></typo3-backend-icon>
                            ${labels.get('installed.badge.update')}
                        </span>
                    ` : nothing}
                </td>
                <td>
                    <code>${pkg.version}</code>
                    ${hasUpdate ? html`
                        <span class="text-muted"> → </span>
                        <code class="text-success">${latestVersion}</code>
                    ` : nothing}
                </td>
                <td class="text-muted" style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${pkg.description || '-'}
                </td>
                <td class="col-control">
                    <div class="btn-group" role="group">
                        <button type="button" class="btn btn-default" title="${labels.get('installed.action.details')}"
                            @click=${() => showPackageDetails(pkg.name)} ?disabled=${disabled}>
                            <typo3-backend-icon identifier="actions-info" size="small"></typo3-backend-icon>
                        </button>
                        ${hasUpdate ? html`
                            <button type="button" class="btn btn-primary"
                                title="${labels.get('installed.action.update.title', [latestVersion])}"
                                @click=${() => this.handleUpdate(pkg.name)} ?disabled=${disabled}>
                                <typo3-backend-icon identifier="actions-synchronize" size="small"></typo3-backend-icon>
                            </button>
                        ` : nothing}
                        ${!pkg.isProtected ? html`
                            <button type="button" class="btn btn-danger"
                                title="${labels.get('installed.action.remove.title')}"
                                @click=${() => this.handleRemove(pkg.name)} ?disabled=${disabled}>
                                <typo3-backend-icon identifier="actions-delete" size="small"></typo3-backend-icon>
                            </button>
                        ` : nothing}
                    </div>
                </td>
            </tr>
        `;
    }
}

customElements.define('typo3-package-manager-installed-list', InstalledList);
