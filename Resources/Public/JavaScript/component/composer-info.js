import { html, LitElement, nothing } from 'lit';
import '@typo3/backend/element/icon-element.js';
import '@typo3/backend/element/spinner-element.js';
import Notification from '@typo3/backend/notification.js';
import labels from '~labels/package_manager.module';
import { fetchComposerInfo } from '@typo3/package-manager/api/composer-api.js';

/**
 * `<typo3-package-manager-composer-info>`
 *
 * Read-only panel showing composer binary info, diagnostics, the platform
 * package list and the protected-packages list. Loads its own data on
 * connect — the shell only has to drop this element into the DOM when
 * the user activates the Composer Info tab.
 */
export class ComposerInfoPanel extends LitElement {
    static properties = {
        info: { type: Object, state: true },
        loading: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this.info = null;
        this.loading = false;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.info === null) {
            this.refresh();
        }
    }

    async refresh() {
        this.loading = true;
        try {
            const data = await fetchComposerInfo();
            if (data.status === 'ok') {
                this.info = data.info;
            }
        } catch (error) {
            console.error('Failed to load composer info:', error);
            Notification.error(labels.get('notification.error'), labels.get('composerInfo.load.error'));
        } finally {
            this.loading = false;
        }
    }

    render() {
        if (this.loading && !this.info) {
            return html`
                <div class="tab-content text-center py-5">
                    <typo3-backend-spinner size="medium"></typo3-backend-spinner>
                    <p class="mt-2 mb-0 text-muted">${labels.get('composerInfo.loading')}</p>
                </div>
            `;
        }
        if (!this.info) {
            return html`
                <div class="tab-content">
                    <div class="callout callout-info">
                        <div class="callout-icon">
                            <span class="icon-emphasized">
                                <typo3-backend-icon identifier="actions-info" size="small"></typo3-backend-icon>
                            </span>
                        </div>
                        <div class="callout-content">
                            <div class="callout-body">
                                <p>${labels.get('composerInfo.load.hint')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        const info = this.info;
        const binary = info.binaryInfo || {};
        const diag = info.diagnostics || {};

        return html`
            <div class="tab-content">
                <div class="row">
                    ${this.renderBinaryCard(info, binary)}
                    ${this.renderDiagnosticsCard(diag)}
                </div>
                ${this.renderProtectedPackagesCard(info.protectedPackages || [])}
                ${this.renderDryRunCallout()}
            </div>
        `;
    }

    renderBinaryCard(info, binary) {
        return html`
            <div class="col-md-6">
                <div class="card mb-4">
                    <div class="card-header">
                        <div class="card-icon">
                            <typo3-backend-icon identifier="actions-package" size="small"></typo3-backend-icon>
                        </div>
                        <div class="card-header-body">
                            <h2 class="card-title">${labels.get('composerInfo.binary.title')}</h2>
                        </div>
                    </div>
                    <div class="card-body">
                        <dl class="row mb-0">
                            <dt class="col-sm-5">${labels.get('composerInfo.binary.status')}</dt>
                            <dd class="col-sm-7">
                                <span class="badge ${info.composerAvailable ? 'badge-success' : 'badge-danger'}">
                                    ${info.composerAvailable
                                        ? labels.get('composerInfo.binary.status.available')
                                        : labels.get('composerInfo.binary.status.notFound')}
                                </span>
                            </dd>
                            ${binary.version ? html`
                                <dt class="col-sm-5">${labels.get('composerInfo.binary.version')}</dt>
                                <dd class="col-sm-7"><code>${binary.version}</code></dd>
                            ` : nothing}
                            ${binary.binaryPath ? html`
                                <dt class="col-sm-5">${labels.get('composerInfo.binary.path')}</dt>
                                <dd class="col-sm-7"><code class="text-break" style="font-size: var(--typo3-font-size-small);">${binary.binaryPath}</code></dd>
                            ` : nothing}
                            ${binary.resolutionMethod ? html`
                                <dt class="col-sm-5">${labels.get('composerInfo.binary.foundVia')}</dt>
                                <dd class="col-sm-7">${binary.resolutionMethod}</dd>
                            ` : nothing}
                            ${binary.composerHome ? html`
                                <dt class="col-sm-5">${labels.get('composerInfo.binary.composerHome')}</dt>
                                <dd class="col-sm-7"><code class="text-break" style="font-size: var(--typo3-font-size-small);">${binary.composerHome}</code></dd>
                            ` : nothing}
                            <dt class="col-sm-5">${labels.get('composerInfo.binary.phpVersion')}</dt>
                            <dd class="col-sm-7"><code>${info.phpVersion}</code></dd>
                            ${binary.projectPath ? html`
                                <dt class="col-sm-5">${labels.get('composerInfo.binary.projectPath')}</dt>
                                <dd class="col-sm-7"><code class="text-break" style="font-size: var(--typo3-font-size-small);">${binary.projectPath}</code></dd>
                            ` : nothing}
                        </dl>
                    </div>
                </div>
            </div>
        `;
    }

    renderDiagnosticsCard(diag) {
        return html`
            <div class="col-md-6">
                <div class="card mb-4">
                    <div class="card-header">
                        <div class="card-icon">
                            <typo3-backend-icon identifier="actions-check" size="small"></typo3-backend-icon>
                        </div>
                        <div class="card-header-body">
                            <h2 class="card-title">${labels.get('composerInfo.diagnostics.title')}</h2>
                        </div>
                    </div>
                    <div class="card-body">
                        <dl class="row mb-3">
                            <dt class="col-sm-5">${labels.get('composerInfo.diagnostics.composerJson')}</dt>
                            <dd class="col-sm-7">
                                <span class="badge ${diag.composerJson ? 'badge-success' : 'badge-danger'}">
                                    ${diag.composerJson
                                        ? labels.get('composerInfo.diagnostics.status.present')
                                        : labels.get('composerInfo.diagnostics.status.missing')}
                                </span>
                            </dd>
                            <dt class="col-sm-5">${labels.get('composerInfo.diagnostics.composerLock')}</dt>
                            <dd class="col-sm-7">
                                <span class="badge ${diag.lockFile ? 'badge-success' : 'badge-warning'}">
                                    ${diag.lockFile
                                        ? labels.get('composerInfo.diagnostics.status.present')
                                        : labels.get('composerInfo.diagnostics.status.missing')}
                                </span>
                                ${diag.lockFile ? html`
                                    <span class="badge ${diag.lockFresh ? 'badge-success' : 'badge-warning'} ms-1">
                                        ${diag.lockFresh
                                            ? labels.get('composerInfo.diagnostics.status.upToDate')
                                            : labels.get('composerInfo.diagnostics.status.outdated')}
                                    </span>
                                ` : nothing}
                            </dd>
                        </dl>
                        ${diag.platform && Object.keys(diag.platform).length > 0 ? html`
                            <h6 class="mb-2">${labels.get('composerInfo.diagnostics.platform')}</h6>
                            <div style="max-height: 200px; overflow-y: auto;">
                                ${Object.entries(diag.platform).map(([name, version]) => html`
                                    <div class="d-flex justify-content-between py-1">
                                        <code style="font-size: var(--typo3-font-size-small);">${name}</code>
                                        <small class="text-muted">${version}</small>
                                    </div>
                                `)}
                            </div>
                        ` : nothing}
                    </div>
                </div>
            </div>
        `;
    }

    renderProtectedPackagesCard(protectedPackages) {
        return html`
            <div class="card mb-4">
                <div class="card-header">
                    <div class="card-icon">
                        <typo3-backend-icon identifier="actions-lock" size="small"></typo3-backend-icon>
                    </div>
                    <div class="card-header-body">
                        <h2 class="card-title">${labels.get('composerInfo.protected.title')}</h2>
                        <span class="card-subtitle">${labels.get('composerInfo.protected.subtitle')}</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="d-flex flex-wrap gap-2">
                        ${protectedPackages.map((pkg) => html`
                            <span class="badge badge-warning">
                                <typo3-backend-icon identifier="actions-lock" size="small"></typo3-backend-icon>
                                ${pkg}
                            </span>
                        `)}
                    </div>
                </div>
            </div>
        `;
    }

    renderDryRunCallout() {
        return html`
            <div class="callout callout-warning">
                <div class="callout-icon">
                    <span class="icon-emphasized">
                        <typo3-backend-icon identifier="actions-exclamation-triangle" size="small"></typo3-backend-icon>
                    </span>
                </div>
                <div class="callout-content">
                    <div class="callout-title">${labels.get('composerInfo.callout.title')}</div>
                    <div class="callout-body">
                        <p>${labels.get('composerInfo.callout.body')}</p>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('typo3-package-manager-composer-info', ComposerInfoPanel);
