import { html, nothing } from 'lit';
import Modal from '@typo3/backend/modal.js';
import { SeverityEnum } from '@typo3/backend/enum/severity.js';
import '@typo3/backend/element/icon-element.js';
import labels from '~labels/package_manager.module';
import { actionBadgeClass } from '@typo3/package-manager/util/format.js';

/**
 * Render the dry-run preview Lit template for a composer operation.
 *
 * Pure view — no side effects, no event handlers wired to host state.
 * The caller decides how to mount it (typically passes it straight to
 * `Modal.advanced({ content: ... })`).
 */
export function renderDryRunPreview(dryRunData) {
    const outputStyle = `
        font-family: var(--typo3-font-family-monospace, monospace);
        font-size: var(--typo3-font-size-small, 0.875rem);
        background: var(--typo3-component-bg, #f8f9fa);
        border: 1px solid var(--typo3-component-border-color, #dee2e6);
        border-radius: var(--typo3-component-border-radius, 0.25rem);
        padding: 1rem;
        max-height: 250px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.5;
    `;

    const parsed = dryRunData.parsed || {};
    const hasOperations = parsed.operations && parsed.operations.length > 0;
    const hasErrors = parsed.errors && parsed.errors.length > 0;
    const hasWarnings = parsed.warnings && parsed.warnings.length > 0;

    return html`
        <div class="package-manager-operation-preview">
            ${dryRunData.command ? html`
                <div class="callout callout-notice mb-3">
                    <div class="callout-icon">
                        <span class="icon-emphasized">
                            <typo3-backend-icon identifier="actions-terminal" size="small"></typo3-backend-icon>
                        </span>
                    </div>
                    <div class="callout-content">
                        <div class="callout-title">${labels.get('operation.dryRun.command')}</div>
                        <div class="callout-body">
                            <code style="font-size: 0.9em; word-break: break-all;">${dryRunData.command}</code>
                        </div>
                    </div>
                </div>
            ` : nothing}

            ${hasOperations ? html`
                <h5 class="mb-2">
                    <typo3-backend-icon identifier="actions-list-alternative" size="small"></typo3-backend-icon>
                    ${labels.get('operation.dryRun.changes')}
                </h5>
                <p class="text-muted small mb-2">${parsed.summary || ''}</p>
                <div class="table-fit mb-3">
                    <table class="table table-sm table-striped mb-0">
                        <thead>
                            <tr>
                                <th style="width: 100px;">${labels.get('operation.dryRun.column.action')}</th>
                                <th>${labels.get('operation.dryRun.column.package')}</th>
                                <th style="width: 180px;">${labels.get('operation.dryRun.column.version')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${parsed.operations.map((op) => html`
                                <tr class="${op.action === 'removing' ? 'table-danger' : op.action === 'installing' ? 'table-success' : ''}">
                                    <td><span class="badge ${actionBadgeClass(op.action)}">${op.action}</span></td>
                                    <td><code>${op.package}</code></td>
                                    <td>
                                        ${op.newVersion ? html`
                                            <code>${op.version}</code>
                                            <span class="text-muted mx-1">→</span>
                                            <code class="text-success">${op.newVersion}</code>
                                        ` : html`<code>${op.version}</code>`}
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            ` : html`<p class="text-muted mb-3">${parsed.summary || labels.get('operation.dryRun.changes.empty')}</p>`}

            ${hasErrors ? html`
                <div class="callout callout-danger mb-3">
                    <div class="callout-icon">
                        <span class="icon-emphasized">
                            <typo3-backend-icon identifier="actions-exclamation-circle" size="small"></typo3-backend-icon>
                        </span>
                    </div>
                    <div class="callout-content">
                        <div class="callout-title">${labels.get('operation.dryRun.issues')}</div>
                        <div class="callout-body">
                            <ul class="mb-0 ps-3">
                                ${parsed.errors.map((err) => html`<li>${err}</li>`)}
                            </ul>
                        </div>
                    </div>
                </div>
            ` : nothing}

            ${hasWarnings ? html`
                <div class="callout callout-warning mb-3">
                    <div class="callout-icon">
                        <span class="icon-emphasized">
                            <typo3-backend-icon identifier="actions-exclamation-triangle" size="small"></typo3-backend-icon>
                        </span>
                    </div>
                    <div class="callout-content">
                        <div class="callout-title">${labels.get('operation.dryRun.warnings')}</div>
                        <div class="callout-body">
                            <ul class="mb-0 ps-3">
                                ${parsed.warnings.map((w) => html`<li>${w}</li>`)}
                            </ul>
                        </div>
                    </div>
                </div>
            ` : nothing}

            ${!dryRunData.success && !hasErrors ? html`
                <div class="callout callout-warning mb-3">
                    <div class="callout-icon">
                        <span class="icon-emphasized">
                            <typo3-backend-icon identifier="actions-exclamation-triangle" size="small"></typo3-backend-icon>
                        </span>
                    </div>
                    <div class="callout-content">
                        <div class="callout-body">
                            <p class="mb-0">${labels.get('operation.dryRun.mayFail')}</p>
                        </div>
                    </div>
                </div>
            ` : nothing}

            <details class="mt-3">
                <summary class="text-muted" style="cursor: pointer;">
                    <typo3-backend-icon identifier="actions-code" size="small"></typo3-backend-icon>
                    ${labels.get('operation.dryRun.rawOutput')}
                </summary>
                <div style="${outputStyle}" class="mt-2">${dryRunData.output || labels.get('operation.dryRun.noOutput')}</div>
                ${dryRunData.errorOutput ? html`
                    <h6 class="mt-2 text-danger">
                        <typo3-backend-icon identifier="actions-exclamation-triangle" size="small"></typo3-backend-icon>
                        ${labels.get('operation.dryRun.errorOutput')}
                    </h6>
                    <div style="${outputStyle}">${dryRunData.errorOutput}</div>
                ` : nothing}
            </details>
        </div>
    `;
}

/**
 * Open the dry-run preview modal and resolve to either 'confirm' or 'cancel'
 * once the user chooses. The caller handles what to do on confirm (typically
 * call the operation again with `dryRun: false`).
 */
export function showDryRunModal({ dryRunData, actionLabel, displayName }) {
    return new Promise((resolve) => {
        Modal.advanced({
            title: labels.get('operation.dryRun.title', [actionLabel, displayName]),
            content: renderDryRunPreview(dryRunData),
            size: Modal.sizes.large,
            severity: dryRunData.success ? SeverityEnum.info : SeverityEnum.warning,
            buttons: [
                {
                    text: labels.get('modal.button.cancel'),
                    btnClass: 'btn-default',
                    name: 'cancel',
                    trigger: (_e, modal) => {
                        modal.hideModal();
                        resolve('cancel');
                    },
                },
                {
                    text: labels.get('operation.dryRun.confirmButton', [actionLabel]),
                    btnClass: dryRunData.success ? 'btn-primary' : 'btn-warning',
                    name: 'confirm',
                    trigger: (_e, modal) => {
                        modal.hideModal();
                        resolve('confirm');
                    },
                },
            ],
        });
    });
}

/**
 * Open a simple error modal showing the raw composer output for a failed
 * operation.
 */
export function showOperationErrorModal({ actionLabel, data }) {
    const outputStyle = `
        font-family: var(--typo3-font-family-monospace, monospace);
        font-size: var(--typo3-font-size-small, 0.875rem);
        background: var(--typo3-component-bg, #f8f9fa);
        border: 1px solid var(--typo3-component-border-color, #dee2e6);
        border-radius: var(--typo3-component-border-radius, 0.25rem);
        padding: 1rem;
        max-height: 200px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-word;
    `;
    Modal.advanced({
        title: labels.get('operation.error.modal.title', [actionLabel]),
        content: html`
            <div>
                <h5>${labels.get('operation.error.modal.output')}</h5>
                <div style="${outputStyle}">${data.output || labels.get('operation.dryRun.noOutput')}</div>
                ${data.errorOutput ? html`
                    <h5 class="mt-3 text-danger">
                        <typo3-backend-icon identifier="actions-exclamation-triangle" size="small"></typo3-backend-icon>
                        ${labels.get('operation.error.modal.errors')}
                    </h5>
                    <div style="${outputStyle}">${data.errorOutput}</div>
                ` : nothing}
            </div>
        `,
        size: Modal.sizes.medium,
        severity: SeverityEnum.error,
        buttons: [
            {
                text: labels.get('operation.modal.close'),
                btnClass: 'btn-default',
                name: 'close',
                trigger: (_e, modal) => modal.hideModal(),
            },
        ],
    });
}
