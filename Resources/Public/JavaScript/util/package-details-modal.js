import { html, nothing } from 'lit';
import Modal from '@typo3/backend/modal.js';
import { SeverityEnum } from '@typo3/backend/enum/severity.js';
import Notification from '@typo3/backend/notification.js';
import '@typo3/backend/element/icon-element.js';
import labels from '~labels/package_manager.module';
import { fetchPackageInfo } from '@typo3/package-manager/api/package-api.js';

const TABLE_STYLE = `
    font-size: var(--typo3-font-size-small);
    background: var(--typo3-component-bg);
    border: 1px solid var(--typo3-component-border-color);
    border-radius: var(--typo3-component-border-radius);
    max-height: 200px;
    overflow-y: auto;
`;

const REQUIRES_STYLE = `
    font-family: var(--typo3-font-family-monospace);
    font-size: var(--typo3-font-size-small);
    background: var(--typo3-component-bg);
    border: 1px solid var(--typo3-component-border-color);
    border-radius: var(--typo3-component-border-radius);
    padding: 1rem;
    max-height: 150px;
    overflow-y: auto;
`;

function formatDate(isoDate) {
    if (!isoDate) {
        return '-';
    }
    try {
        return new Date(isoDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return isoDate.split('T')[0] || isoDate;
    }
}

/**
 * Fetch the package metadata for `packageName` and open a modal with the
 * details (description, license, available versions, dependencies, …).
 */
export async function showPackageDetails(packageName) {
    let data;
    try {
        data = await fetchPackageInfo(packageName);
    } catch (error) {
        console.error('Failed to load package details:', error);
        Notification.error(labels.get('notification.error'), labels.get('packageDetails.load.error'));
        return;
    }
    if (data.status !== 'ok' || !data.info) {
        Notification.error(labels.get('notification.error'), data.message || labels.get('packageDetails.load.error'));
        return;
    }

    const info = data.info;
    const versionEntries = Object.entries(info.availableVersions || {});

    const modalContent = html`
        <div class="package-details">
            <dl class="row">
                <dt class="col-sm-4">${labels.get('packageDetails.name')}</dt>
                <dd class="col-sm-8"><code>${info.name || packageName}</code></dd>
                ${info.description ? html`
                    <dt class="col-sm-4">${labels.get('packageDetails.description')}</dt>
                    <dd class="col-sm-8">${info.description}</dd>
                ` : nothing}
                ${info.versions ? html`
                    <dt class="col-sm-4">${labels.get('packageDetails.installedVersion')}</dt>
                    <dd class="col-sm-8"><code>${info.versions[0] || '-'}</code></dd>
                ` : nothing}
                ${info.type ? html`
                    <dt class="col-sm-4">${labels.get('packageDetails.type')}</dt>
                    <dd class="col-sm-8"><code>${info.type}</code></dd>
                ` : nothing}
                ${info.licenses && info.licenses.length > 0 ? html`
                    <dt class="col-sm-4">${labels.get('packageDetails.license')}</dt>
                    <dd class="col-sm-8">${info.licenses
                        .map((l) => (typeof l === 'string' ? l : l.name || l.type || String(l)))
                        .join(', ')}</dd>
                ` : nothing}
                ${info.homepage ? html`
                    <dt class="col-sm-4">${labels.get('packageDetails.homepage')}</dt>
                    <dd class="col-sm-8"><a href="${info.homepage}" target="_blank" rel="noopener">${info.homepage}</a></dd>
                ` : nothing}
                ${info.support?.source ? html`
                    <dt class="col-sm-4">${labels.get('packageDetails.source')}</dt>
                    <dd class="col-sm-8"><a href="${info.support.source}" target="_blank" rel="noopener">${info.support.source}</a></dd>
                ` : nothing}
                ${info.path ? html`
                    <dt class="col-sm-4">${labels.get('packageDetails.path')}</dt>
                    <dd class="col-sm-8"><code style="font-size: var(--typo3-font-size-small); word-break: break-all;">${info.path}</code></dd>
                ` : nothing}
            </dl>

            ${versionEntries.length > 0 ? html`
                <h6 class="mt-4 mb-2">${labels.get('packageDetails.availableVersions')}</h6>
                <div style="${TABLE_STYLE}">
                    <table class="table table-sm table-striped mb-0">
                        <thead>
                            <tr>
                                <th>${labels.get('packageDetails.column.version')}</th>
                                <th>${labels.get('packageDetails.column.released')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${versionEntries.map(([, vData]) => html`
                                <tr>
                                    <td>
                                        <code>${vData.version}</code>
                                        ${info.versions && info.versions[0] === vData.version ? html`
                                            <span class="badge badge-success ms-1">${labels.get('packageDetails.badge.installed')}</span>
                                        ` : nothing}
                                    </td>
                                    <td><small>${formatDate(vData.time)}</small></td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            ` : nothing}

            ${info.requires && Object.keys(info.requires).length > 0 ? html`
                <h6 class="mt-4 mb-2">${labels.get('packageDetails.dependencies')}</h6>
                <div style="${REQUIRES_STYLE}">
                    ${Object.entries(info.requires).map(([pkg, version]) => html`
                        <div>${pkg}: ${version}</div>
                    `)}
                </div>
            ` : nothing}
        </div>
    `;

    Modal.advanced({
        title: labels.get('packageDetails.title', [packageName]),
        content: modalContent,
        size: Modal.sizes.large,
        severity: SeverityEnum.info,
        buttons: [
            {
                text: labels.get('packageDetails.button.close'),
                btnClass: 'btn-default',
                name: 'close',
                trigger: (_e, modal) => modal.hideModal(),
            },
        ],
    });
}
