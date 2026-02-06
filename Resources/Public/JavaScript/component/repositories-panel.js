import { html, LitElement } from 'lit';
import '@typo3/backend/element/icon-element.js';
import '@typo3/backend/element/spinner-element.js';
import Notification from '@typo3/backend/notification.js';
import labels from '~labels/package_manager.module';
import { fetchRepositoriesAndAuth } from '@typo3/package-manager/api/repository-api.js';
import { EVENTS } from '@typo3/package-manager/util/constants.js';
import {
    openAddRepositoryModal,
    openRemoveRepositoryModal,
    openSetAuthModal,
    openRemoveAuthModal,
} from '@typo3/package-manager/modal/repository-modals.js';

/**
 * `<typo3-package-manager-repositories>`
 *
 * Renders the entire Repositories tab — both the configured Composer
 * repositories and the project's auth.json credentials. Both lists share
 * a single AJAX endpoint (`package_manager_repositories`), so they live
 * in one component.
 */
export class RepositoriesPanel extends LitElement {
    static properties = {
        repositories: { type: Array, state: true },
        auth: { type: Array, state: true },
        loading: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this.repositories = [];
        this.auth = [];
        this.loading = false;
        this._refresh = () => this.refresh();
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener(EVENTS.REPOSITORIES_CHANGED, this._refresh);
        document.addEventListener(EVENTS.AUTH_CHANGED, this._refresh);
        this.refresh();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener(EVENTS.REPOSITORIES_CHANGED, this._refresh);
        document.removeEventListener(EVENTS.AUTH_CHANGED, this._refresh);
    }

    async refresh() {
        this.loading = true;
        try {
            const data = await fetchRepositoriesAndAuth();
            if (data.status === 'ok') {
                this.repositories = data.repositories || [];
                this.auth = data.auth || [];
            }
        } catch (error) {
            console.error('Failed to load repositories:', error);
            Notification.error(labels.get('notification.error'), labels.get('repositories.load.error'));
        } finally {
            this.loading = false;
        }
    }

    render() {
        if (this.loading && this.repositories.length === 0 && this.auth.length === 0) {
            return html`
                <div class="tab-content text-center py-5">
                    <typo3-backend-spinner size="medium"></typo3-backend-spinner>
                    <p class="mt-2 mb-0 text-muted">${labels.get('repositories.loading')}</p>
                </div>
            `;
        }
        return html`
            <div class="tab-content">
                ${this.renderRepositoryCard()}
                ${this.renderAuthCard()}
            </div>
        `;
    }

    renderRepositoryCard() {
        return html`
            <div class="card mb-4">
                <div class="card-header">
                    <div class="card-icon">
                        <typo3-backend-icon identifier="actions-database" size="small"></typo3-backend-icon>
                    </div>
                    <div class="card-header-body">
                        <h2 class="card-title">${labels.get('repositories.title')}</h2>
                        <span class="card-subtitle">${labels.get('repositories.subtitle', [this.repositories.length])}</span>
                    </div>
                    <div class="card-header-actions">
                        <button type="button" class="btn btn-primary btn-sm"
                            @click=${() => openAddRepositoryModal(() => this.refresh())}>
                            <typo3-backend-icon identifier="actions-plus" size="small"></typo3-backend-icon>
                            ${labels.get('repositories.action.add')}
                        </button>
                    </div>
                </div>
                ${this.repositories.length > 0 ? this.renderRepositoryTable() : html`
                    <div class="card-body">
                        <p class="text-muted mb-0">${labels.get('repositories.empty')}</p>
                    </div>
                `}
            </div>
        `;
    }

    renderRepositoryTable() {
        return html`
            <div class="table-fit">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>${labels.get('repositories.column.name')}</th>
                            <th>${labels.get('repositories.column.type')}</th>
                            <th>${labels.get('repositories.column.url')}</th>
                            <th class="col-control"><span class="visually-hidden">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.repositories.map((repo) => html`
                            <tr>
                                <td><strong>${repo.name}</strong></td>
                                <td><span class="badge badge-default">${repo.type}</span></td>
                                <td><code class="text-break" style="font-size: var(--typo3-font-size-small);">${repo.url}</code></td>
                                <td class="col-control">
                                    <button type="button" class="btn btn-danger btn-sm"
                                        title="${labels.get('repositories.action.remove.title')}"
                                        @click=${() => openRemoveRepositoryModal(repo.name, () => this.refresh())}>
                                        <typo3-backend-icon identifier="actions-delete" size="small"></typo3-backend-icon>
                                    </button>
                                </td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderAuthCard() {
        return html`
            <div class="card mb-4">
                <div class="card-header">
                    <div class="card-icon">
                        <typo3-backend-icon identifier="actions-lock" size="small"></typo3-backend-icon>
                    </div>
                    <div class="card-header-body">
                        <h2 class="card-title">${labels.get('auth.title')}</h2>
                        <span class="card-subtitle">${labels.get('auth.subtitle')}</span>
                    </div>
                    <div class="card-header-actions">
                        <button type="button" class="btn btn-primary btn-sm"
                            @click=${() => openSetAuthModal(() => this.refresh())}>
                            <typo3-backend-icon identifier="actions-plus" size="small"></typo3-backend-icon>
                            ${labels.get('auth.action.add')}
                        </button>
                    </div>
                </div>
                ${this.auth.length > 0 ? this.renderAuthTable() : html`
                    <div class="card-body">
                        <p class="text-muted mb-0">${labels.get('auth.empty')}</p>
                    </div>
                `}
            </div>
        `;
    }

    renderAuthTable() {
        return html`
            <div class="table-fit">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>${labels.get('auth.column.host')}</th>
                            <th>${labels.get('auth.column.type')}</th>
                            <th class="col-control"><span class="visually-hidden">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.auth.map((entry) => html`
                            <tr>
                                <td><code>${entry.host}</code></td>
                                <td><span class="badge badge-info">${entry.type}</span></td>
                                <td class="col-control">
                                    <button type="button" class="btn btn-danger btn-sm"
                                        title="${labels.get('auth.action.remove.title')}"
                                        @click=${() => openRemoveAuthModal(entry.type, entry.host, () => this.refresh())}>
                                        <typo3-backend-icon identifier="actions-delete" size="small"></typo3-backend-icon>
                                    </button>
                                </td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
        `;
    }
}

customElements.define('typo3-package-manager-repositories', RepositoriesPanel);
