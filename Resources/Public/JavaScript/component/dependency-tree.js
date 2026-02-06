import { html, LitElement, nothing } from 'lit';
import '@typo3/backend/element/icon-element.js';
import '@typo3/backend/element/spinner-element.js';
import Notification from '@typo3/backend/notification.js';
import labels from '~labels/package_manager.module';
import { fetchDependencyTree } from '@typo3/package-manager/api/composer-api.js';

/**
 * `<typo3-package-manager-dependency-tree>`
 *
 * Recursive expandable tree of installed packages and their composer
 * dependencies. Owns its own expansion state — collapsing, level-1 expand,
 * full expand and per-node toggle. Loads the tree on connect.
 */
export class DependencyTreePanel extends LitElement {
    static properties = {
        tree: { type: Object, state: true },
        loading: { type: Boolean, state: true },
        expandedNodes: { type: Object, state: true },
    };

    constructor() {
        super();
        this.tree = null;
        this.loading = false;
        this.expandedNodes = new Set();
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.tree === null) {
            this.refresh();
        }
    }

    async refresh() {
        this.loading = true;
        try {
            const data = await fetchDependencyTree();
            if (data.status === 'ok') {
                this.tree = data.tree;
            }
        } catch (error) {
            console.error('Failed to load dependency tree:', error);
            Notification.error(labels.get('notification.error'), labels.get('dependencyTree.load.error'));
        } finally {
            this.loading = false;
        }
    }

    toggleNode(nodeKey) {
        const next = new Set(this.expandedNodes);
        if (next.has(nodeKey)) {
            next.delete(nodeKey);
        } else {
            next.add(nodeKey);
        }
        this.expandedNodes = next;
    }

    expandFirstLevel() {
        const next = new Set();
        for (const pkg of this.tree?.installed ?? []) {
            if (pkg.requires && pkg.requires.length > 0) {
                next.add(pkg.name);
            }
        }
        this.expandedNodes = next;
    }

    expandAll() {
        const next = new Set();
        const collect = (packages, parentKey = '') => {
            if (!packages) {
                return;
            }
            for (const pkg of packages) {
                const nodeKey = parentKey ? `${parentKey}>${pkg.name}` : pkg.name;
                if (pkg.requires && pkg.requires.length > 0) {
                    next.add(nodeKey);
                    collect(pkg.requires, nodeKey);
                }
            }
        };
        collect(this.tree?.installed);
        this.expandedNodes = next;
    }

    collapseAll() {
        this.expandedNodes = new Set();
    }

    render() {
        if (this.loading && !this.tree) {
            return html`
                <div class="tab-content text-center py-5">
                    <typo3-backend-spinner size="medium"></typo3-backend-spinner>
                    <p class="mt-2 mb-0 text-muted">${labels.get('dependencyTree.loading')}</p>
                </div>
            `;
        }
        if (!this.tree || !this.tree.installed) {
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
                                <p>${labels.get('dependencyTree.load.hint')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        return html`
            <div class="tab-content">
                <div class="card">
                    <div class="card-header">
                        <div class="card-icon">
                            <typo3-backend-icon identifier="apps-pagetree-root" size="small"></typo3-backend-icon>
                        </div>
                        <div class="card-header-body">
                            <h2 class="card-title">${labels.get('dependencyTree.title')}</h2>
                            <span class="card-subtitle">${labels.get('dependencyTree.subtitle', [this.tree.installed.length])}</span>
                        </div>
                        <div class="card-header-actions">
                            <div class="btn-group" role="group">
                                <button type="button" class="btn btn-default btn-sm"
                                    @click=${() => this.expandAll()}
                                    title="${labels.get('dependencyTree.expandAll.title')}">
                                    <typo3-backend-icon identifier="actions-plus" size="small"></typo3-backend-icon>
                                    ${labels.get('dependencyTree.expandAll')}
                                </button>
                                <button type="button" class="btn btn-default btn-sm"
                                    @click=${() => this.expandFirstLevel()}
                                    title="${labels.get('dependencyTree.level1.title')}">
                                    <typo3-backend-icon identifier="actions-caret-down" size="small"></typo3-backend-icon>
                                    ${labels.get('dependencyTree.level1')}
                                </button>
                                <button type="button" class="btn btn-default btn-sm"
                                    @click=${() => this.collapseAll()}
                                    title="${labels.get('dependencyTree.collapse.title')}">
                                    <typo3-backend-icon identifier="actions-minus" size="small"></typo3-backend-icon>
                                    ${labels.get('dependencyTree.collapse')}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="card-body" style="max-height: 600px; overflow-y: auto;">
                        <div class="dependency-tree" role="tree" aria-label="${labels.get('dependencyTree.ariaLabel')}">
                            ${this.tree.installed.map((pkg) => this.renderTreeNode(pkg, 0))}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderTreeNode(pkg, depth, parentKey = '') {
        const nodeKey = parentKey ? `${parentKey}>${pkg.name}` : pkg.name;
        const indent = depth * 1.5;
        const hasChildren = pkg.requires && pkg.requires.length > 0;
        const isExpanded = this.expandedNodes.has(nodeKey);
        const childCount = hasChildren ? pkg.requires.length : 0;
        const depsLabel = hasChildren
            ? labels.get(childCount === 1 ? 'dependencyTree.deps.one' : 'dependencyTree.deps.other', [childCount])
            : '';

        return html`
            <div class="dependency-node"
                style="margin-left: ${indent}rem;"
                role="treeitem"
                aria-expanded="${hasChildren ? isExpanded : nothing}"
                aria-level="${depth + 1}">
                <div class="d-flex align-items-center py-1 ${hasChildren ? 'dependency-node-expandable' : ''}"
                    style="${hasChildren ? 'cursor: pointer;' : ''}"
                    @click=${hasChildren ? () => this.toggleNode(nodeKey) : nothing}
                    @keydown=${hasChildren
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                this.toggleNode(nodeKey);
                            }
                        }
                        : nothing}
                    tabindex="${hasChildren ? '0' : '-1'}">
                    ${hasChildren ? html`
                        <typo3-backend-icon
                            identifier="${isExpanded ? 'actions-caret-down' : 'actions-caret-right'}"
                            size="small"
                            class="me-1 flex-shrink-0"></typo3-backend-icon>
                    ` : html`
                        <span class="me-1 flex-shrink-0" style="width: 16px; display: inline-block;" aria-hidden="true"></span>
                    `}
                    <code class="me-2 flex-shrink-0">${pkg.name}</code>
                    <span class="badge badge-default me-2 flex-shrink-0">${pkg.version || ''}</span>
                    ${hasChildren && !isExpanded ? html`
                        <span class="badge badge-info me-2 flex-shrink-0">${depsLabel}</span>
                    ` : nothing}
                    ${pkg.description ? html`
                        <small class="text-muted text-truncate" style="max-width: 400px;">${pkg.description}</small>
                    ` : nothing}
                </div>
                ${hasChildren && isExpanded ? html`
                    <div class="dependency-children" role="group">
                        ${pkg.requires.map((child) => this.renderTreeNode(child, depth + 1, nodeKey))}
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('typo3-package-manager-dependency-tree', DependencyTreePanel);
