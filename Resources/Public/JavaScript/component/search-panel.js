import { html, LitElement, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import Modal from '@typo3/backend/modal.js';
import { SeverityEnum } from '@typo3/backend/enum/severity.js';
import Notification from '@typo3/backend/notification.js';
import '@typo3/backend/element/icon-element.js';
import '@typo3/backend/element/spinner-element.js';
import labels from '~labels/package_manager.module';
import {
    fetchSuggestions,
    searchPackages,
} from '@typo3/package-manager/api/package-api.js';
import { runOperation, isBusy } from '@typo3/package-manager/util/operation-runner.js';
import { EVENTS, SEARCH_DEBOUNCE_MS } from '@typo3/package-manager/util/constants.js';

const MAX_VISIBLE_PAGES = 5;

/**
 * `<typo3-package-manager-search-panel>`
 *
 * Owns the cross-source package search: a debounced query input, paginated
 * Packagist results merged with results from any configured local
 * repositories, and per-row Install/Update buttons. Refetches the current
 * page after any operation completes so installed-state badges stay
 * accurate.
 */
export class SearchPanel extends LitElement {
    static properties = {
        query: { type: String, state: true },
        packagistResults: { type: Array, state: true },
        localResults: { type: Array, state: true },
        sources: { type: Array, state: true },
        total: { type: Number, state: true },
        page: { type: Number, state: true },
        totalPages: { type: Number, state: true },
        loading: { type: Boolean, state: true },
        busy: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this.query = '';
        this.packagistResults = [];
        this.localResults = [];
        this.sources = [];
        this.total = 0;
        this.page = 1;
        this.totalPages = 0;
        this.loading = false;
        this.busy = false;
        this._debounceHandle = null;
        this._onOperationCompleted = (event) => {
            this.busy = false;
            if (event.detail?.success && this.query.length >= 2) {
                this.performSearch(this.page);
            }
        };
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener(EVENTS.OPERATION_COMPLETED, this._onOperationCompleted);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener(EVENTS.OPERATION_COMPLETED, this._onOperationCompleted);
        if (this._debounceHandle !== null) {
            clearTimeout(this._debounceHandle);
        }
    }

    handleInput(event) {
        this.query = event.target.value;
        if (this._debounceHandle !== null) {
            clearTimeout(this._debounceHandle);
        }
        if (this.query.length >= 2) {
            this._debounceHandle = setTimeout(() => this.performSearch(), SEARCH_DEBOUNCE_MS);
        } else {
            this.packagistResults = [];
            this.localResults = [];
            this.sources = [];
            this.total = 0;
        }
    }

    async performSearch(page = 1) {
        if (this.query.length < 2) {
            return;
        }
        this.loading = true;
        this.page = page;
        try {
            const data = await searchPackages(this.query, page);
            if (data.status === 'ok') {
                this.packagistResults = data.packages || [];
                this.localResults = data.localResults || [];
                this.sources = data.sources || [];
                this.total = data.total || 0;
                this.totalPages = data.totalPages || 0;
            }
        } catch (error) {
            console.error('Search failed:', error);
            Notification.error(labels.get('notification.error'), labels.get('search.error'));
        } finally {
            this.loading = false;
        }
    }

    async handleInstall(packageName) {
        let suggestData;
        try {
            suggestData = await fetchSuggestions(packageName);
        } catch (error) {
            console.error('Failed to fetch suggestions:', error);
            this.busy = true;
            await runOperation('require', packageName, 'Install');
            return;
        }
        const hasSuggestions =
            suggestData?.status === 'ok' && Object.keys(suggestData.suggestions || {}).length > 0;
        if (!hasSuggestions) {
            this.busy = true;
            await runOperation('require', packageName, 'Install');
            return;
        }
        this.openSuggestionsModal(packageName, suggestData.suggestions);
    }

    async handleUpdate(packageName) {
        this.busy = true;
        await runOperation('update', packageName, 'Update');
    }

    openSuggestionsModal(packageName, suggestions) {
        const entries = Object.entries(suggestions);
        const content = html`
            <div class="install-with-suggestions">
                <p>${labels.get('search.suggestions.intro', [packageName])}</p>
                <h6 class="mt-3 mb-2">${labels.get('search.suggestions.heading')}</h6>
                <p class="text-muted small">${labels.get('search.suggestions.description', [packageName])}</p>
                <div class="suggestions-list" style="max-height: 300px; overflow-y: auto;">
                    ${entries.map(([name, description]) => html`
                        <div class="form-check mb-2">
                            <input class="form-check-input suggestion-checkbox" type="checkbox"
                                value="${name}" id="suggest-${name.replace(/\//g, '-')}">
                            <label class="form-check-label" for="suggest-${name.replace(/\//g, '-')}">
                                <code>${name}</code>
                                ${description ? html`<br><small class="text-muted">${description}</small>` : nothing}
                            </label>
                        </div>
                    `)}
                </div>
            </div>
        `;
        Modal.advanced({
            title: labels.get('search.suggestions.modal.title', [packageName]),
            content,
            size: Modal.sizes.medium,
            severity: SeverityEnum.info,
            buttons: [
                {
                    text: labels.get('modal.button.cancel'),
                    btnClass: 'btn-default',
                    name: 'cancel',
                    trigger: (_e, modal) => modal.hideModal(),
                },
                {
                    text: labels.get('search.suggestions.install'),
                    btnClass: 'btn-primary',
                    name: 'install',
                    trigger: async (_e, modal) => {
                        const root = modal.querySelector ? modal : modal.currentModal;
                        const checked = root.querySelectorAll('.suggestion-checkbox:checked');
                        const selected = Array.from(checked).map((cb) => cb.value);
                        modal.hideModal();
                        this.busy = true;
                        await runOperation('require', packageName, 'Install', selected);
                    },
                },
            ],
        });
    }

    render() {
        const hasQuery = this.query.length >= 2;
        return html`
            <div class="tab-content">
                ${this.renderSearchBar()}
                ${hasQuery ? this.renderResults() : this.renderPlaceholder()}
            </div>
        `;
    }

    renderSearchBar() {
        const disabled = this.busy || isBusy();
        return html`
            <div class="mb-4">
                <div class="input-group">
                    <span class="input-group-text">
                        <typo3-backend-icon identifier="actions-search" size="small"></typo3-backend-icon>
                    </span>
                    <input type="search" class="form-control"
                        placeholder="${labels.get('search.input.placeholder')}"
                        .value=${this.query}
                        @input=${(e) => this.handleInput(e)}
                        ?disabled=${disabled}>
                    ${this.loading ? html`
                        <span class="input-group-text">
                            <typo3-backend-spinner size="small"></typo3-backend-spinner>
                        </span>
                    ` : nothing}
                </div>
                ${this.query && this.query.length < 2 ? html`
                    <small class="text-muted">${labels.get('search.input.hint')}</small>
                ` : nothing}
            </div>
        `;
    }

    renderPlaceholder() {
        return html`
            <div class="card">
                <div class="card-body text-center py-5">
                    <typo3-backend-icon identifier="actions-search" size="large" class="mb-3"></typo3-backend-icon>
                    <h5>${labels.get('search.placeholder.title')}</h5>
                    <p class="text-muted mb-0">${labels.get('search.placeholder.body')}</p>
                </div>
            </div>
        `;
    }

    renderResults() {
        const allResults = [
            ...this.localResults.map((pkg) => ({ ...pkg, _source: pkg.source || 'Local' })),
            ...this.packagistResults.map((pkg) => ({ ...pkg, _source: 'packagist.org' })),
        ];
        const totalCount = this.localResults.length + this.total;

        if (this.loading && allResults.length === 0) {
            return this.renderResultsCard(html`
                <div class="card-body text-center py-5">
                    <typo3-backend-spinner size="medium"></typo3-backend-spinner>
                    <p class="mt-2 mb-0 text-muted">${labels.get('search.results.loading')}</p>
                </div>
            `);
        }
        if (allResults.length === 0) {
            return this.renderResultsCard(html`
                <div class="card-body">
                    <p class="text-muted mb-0">${labels.get('search.results.empty', [this.query])}</p>
                </div>
            `);
        }

        const subtitle = this.sources.length > 0
            ? this.sources.map((s) => `${s.label} (${s.count})`).join(', ')
            : labels.get('search.results.subtitle', [totalCount]);

        return html`
            <div class="card mb-4">
                ${this.renderResultsCardHeader(subtitle)}
                <div class="table-fit">
                    <table class="table table-striped table-hover mb-0">
                        <thead>
                            <tr>
                                <th>${labels.get('search.column.package')}</th>
                                <th>${labels.get('search.column.description')}</th>
                                <th style="width: 140px;">${labels.get('search.column.source')}</th>
                                <th class="col-control"><span class="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${repeat(allResults, (pkg) => pkg._source + '/' + pkg.name, (pkg) => this.renderRow(pkg))}
                        </tbody>
                    </table>
                </div>
                ${this.totalPages > 1 ? this.renderPagination() : nothing}
            </div>
        `;
    }

    renderResultsCard(body) {
        return html`
            <div class="card mb-4">
                ${this.renderResultsCardHeader()}
                ${body}
            </div>
        `;
    }

    renderResultsCardHeader(subtitle = '') {
        return html`
            <div class="card-header">
                <div class="card-icon">
                    <typo3-backend-icon identifier="actions-search" size="small"></typo3-backend-icon>
                </div>
                <div class="card-header-body">
                    <h2 class="card-title">${labels.get('search.results.title')}</h2>
                    ${subtitle ? html`<span class="card-subtitle">${subtitle}</span>` : nothing}
                </div>
            </div>
        `;
    }

    renderRow(pkg) {
        const disabled = this.busy || isBusy();
        return html`
            <tr>
                <td>
                    <strong>${pkg.name}</strong>
                    ${pkg.isInstalled ? html`
                        <span class="badge badge-success ms-2">${labels.get('search.results.badge.installed', [pkg.installedVersion])}</span>
                    ` : nothing}
                    ${pkg.isProtected ? html`
                        <span class="badge badge-warning ms-2">
                            <typo3-backend-icon identifier="actions-lock" size="small"></typo3-backend-icon>
                            ${labels.get('installed.badge.protected')}
                        </span>
                    ` : nothing}
                </td>
                <td class="text-muted">${pkg.description || '-'}</td>
                <td><span class="badge badge-default">${pkg._source}</span></td>
                <td class="col-control">
                    <div class="btn-group" role="group">
                        ${pkg.isInstalled ? html`
                            <button type="button" class="btn btn-default"
                                title="${labels.get('search.action.update.title')}"
                                @click=${() => this.handleUpdate(pkg.name)} ?disabled=${disabled}>
                                <typo3-backend-icon identifier="actions-synchronize" size="small"></typo3-backend-icon>
                            </button>
                        ` : html`
                            <button type="button" class="btn btn-primary"
                                title="${labels.get('search.action.install.title')}"
                                @click=${() => this.handleInstall(pkg.name)} ?disabled=${disabled}>
                                <typo3-backend-icon identifier="actions-download" size="small"></typo3-backend-icon>
                                ${labels.get('search.action.install')}
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }

    renderPagination() {
        let startPage = Math.max(1, this.page - Math.floor(MAX_VISIBLE_PAGES / 2));
        const endPage = Math.min(this.totalPages, startPage + MAX_VISIBLE_PAGES - 1);
        if (endPage - startPage < MAX_VISIBLE_PAGES - 1) {
            startPage = Math.max(1, endPage - MAX_VISIBLE_PAGES + 1);
        }
        const pages = [];
        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }
        const isFirst = this.page === 1;
        const isLast = this.page === this.totalPages;
        return html`
            <div class="card-footer">
                <nav>
                    <ul class="pagination pagination-sm mb-0 justify-content-center">
                        <li class="page-item ${isFirst ? 'disabled' : ''}">
                            <button class="page-link" @click=${() => this.performSearch(1)} ?disabled=${isFirst}>${labels.get('search.pagination.first')}</button>
                        </li>
                        <li class="page-item ${isFirst ? 'disabled' : ''}">
                            <button class="page-link" @click=${() => this.performSearch(this.page - 1)} ?disabled=${isFirst}>${labels.get('search.pagination.previous')}</button>
                        </li>
                        ${pages.map((page) => html`
                            <li class="page-item ${this.page === page ? 'active' : ''}">
                                <button class="page-link" @click=${() => this.performSearch(page)}>${page}</button>
                            </li>
                        `)}
                        <li class="page-item ${isLast ? 'disabled' : ''}">
                            <button class="page-link" @click=${() => this.performSearch(this.page + 1)} ?disabled=${isLast}>${labels.get('search.pagination.next')}</button>
                        </li>
                        <li class="page-item ${isLast ? 'disabled' : ''}">
                            <button class="page-link" @click=${() => this.performSearch(this.totalPages)} ?disabled=${isLast}>${labels.get('search.pagination.last')}</button>
                        </li>
                    </ul>
                </nav>
            </div>
        `;
    }
}

customElements.define('typo3-package-manager-search-panel', SearchPanel);
