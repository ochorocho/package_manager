import { html, render, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import Modal from '@typo3/backend/modal.js';
import { SeverityEnum } from '@typo3/backend/enum/severity.js';
import Notification from '@typo3/backend/notification.js';
import labels from '~labels/package_manager.module';
import {
    addRepository,
    removeRepository,
    setAuth,
    removeAuth,
} from '@typo3/package-manager/api/repository-api.js';
import {
    AUTH_TYPES,
    AUTH_TYPE_DEFAULT_HOSTS,
    findAuthType,
} from '@typo3/package-manager/util/auth-types.js';

const REPO_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Open the Add Repository modal. On success, calls `onSuccess()` so the
 * caller can refresh its list.
 */
export function openAddRepositoryModal(onSuccess) {
    const content = html`
        <div class="add-repository-form">
            <div class="mb-3">
                <label class="form-label" for="repo-name">${labels.get('modal.addRepo.name')}</label>
                <input type="text" class="form-control" id="repo-name"
                    placeholder="${labels.get('modal.addRepo.name.placeholder')}"
                    pattern="[a-zA-Z0-9_-]+" required>
                <div class="form-text">${labels.get('modal.addRepo.name.hint')}</div>
            </div>
            <div class="mb-3">
                <label class="form-label" for="repo-type">${labels.get('modal.addRepo.type')}</label>
                <select class="form-select" id="repo-type">
                    <option value="vcs">${labels.get('modal.addRepo.type.vcs')}</option>
                    <option value="composer">${labels.get('modal.addRepo.type.composer')}</option>
                    <option value="path">${labels.get('modal.addRepo.type.path')}</option>
                    <option value="artifact">${labels.get('modal.addRepo.type.artifact')}</option>
                </select>
            </div>
            <div class="mb-3">
                <label class="form-label" for="repo-url">${labels.get('modal.addRepo.url')}</label>
                <input type="text" class="form-control" id="repo-url"
                    placeholder="${labels.get('modal.addRepo.url.placeholder')}" required>
                <div class="form-text">${labels.get('modal.addRepo.url.hint')}</div>
            </div>
        </div>
    `;

    Modal.advanced({
        title: labels.get('modal.addRepo.title'),
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
                text: labels.get('modal.button.addRepo'),
                btnClass: 'btn-primary',
                name: 'add',
                trigger: async (_e, modal) => {
                    const root = modal.querySelector ? modal : modal.currentModal || modal;
                    const name = root.querySelector('#repo-name')?.value?.trim() || '';
                    const type = root.querySelector('#repo-type')?.value || '';
                    const url = root.querySelector('#repo-url')?.value?.trim() || '';

                    if (!name || !url) {
                        Notification.warning(labels.get('notification.warning'), labels.get('modal.addRepo.validation.required'));
                        return;
                    }
                    if (!REPO_NAME_PATTERN.test(name)) {
                        Notification.warning(labels.get('notification.warning'), labels.get('modal.addRepo.validation.namePattern'));
                        return;
                    }

                    modal.hideModal();
                    try {
                        const data = await addRepository({ name, type, url });
                        if (data.status === 'ok') {
                            Notification.success(labels.get('notification.success'), labels.get('modal.addRepo.success', [name]));
                            onSuccess?.();
                        } else {
                            Notification.error(labels.get('notification.error'), data.errorOutput || data.message || labels.get('modal.addRepo.error'));
                        }
                    } catch (error) {
                        console.error('Failed to add repository:', error);
                        Notification.error(labels.get('notification.error'), labels.get('modal.addRepo.error'));
                    }
                },
            },
        ],
    });
}

export function openRemoveRepositoryModal(name, onSuccess) {
    Modal.advanced({
        title: labels.get('modal.removeRepo.title'),
        content: html`<p>${labels.get('modal.removeRepo.confirm', [name])}</p>`,
        size: Modal.sizes.small,
        severity: SeverityEnum.warning,
        buttons: [
            {
                text: labels.get('modal.button.cancel'),
                btnClass: 'btn-default',
                name: 'cancel',
                trigger: (_e, modal) => modal.hideModal(),
            },
            {
                text: labels.get('modal.button.remove'),
                btnClass: 'btn-danger',
                name: 'remove',
                trigger: async (_e, modal) => {
                    modal.hideModal();
                    try {
                        const data = await removeRepository(name);
                        if (data.status === 'ok') {
                            Notification.success(labels.get('notification.success'), labels.get('modal.removeRepo.success', [name]));
                            onSuccess?.();
                        } else {
                            Notification.error(labels.get('notification.error'), data.errorOutput || labels.get('modal.removeRepo.error'));
                        }
                    } catch (error) {
                        console.error('Failed to remove repository:', error);
                        Notification.error(labels.get('notification.error'), labels.get('modal.removeRepo.error'));
                    }
                },
            },
        ],
    });
}

/**
 * Open the auth-credentials modal.
 *
 * The modal body is rendered with a self-contained reactive state object:
 * a closure holds the form state (selected type, host, single-field
 * values, and the multi-row header list), and any change handler updates
 * the state and re-renders via lit-html's `render()`. This avoids the
 * cross-document custom-element registration problem (TYPO3 modals mount
 * in the parent document, where extension-registered custom elements are
 * not available) while still being declarative.
 */
export function openSetAuthModal(onSuccess) {
    let nextRowId = 0;
    const newRow = () => ({ id: ++nextRowId, name: '', value: '' });

    const state = {
        type: AUTH_TYPES[0].value,
        host: AUTH_TYPES[0].defaultHost,
        fields: {},
        rows: [newRow()],
    };
    let mountPoint = null;

    const update = (patch) => {
        Object.assign(state, patch);
        if (mountPoint) {
            render(formTemplate(), mountPoint);
        }
    };

    const setType = (newType) => {
        const def = findAuthType(newType);
        const nextHost = !state.host || AUTH_TYPE_DEFAULT_HOSTS.includes(state.host)
            ? def.defaultHost
            : state.host;
        update({
            type: newType,
            host: nextHost,
            fields: {},
            rows: def.multiRow && state.rows.length === 0 ? [newRow()] : state.rows,
        });
    };

    const setField = (key, value) => update({ fields: { ...state.fields, [key]: value } });
    const setRowField = (id, key, value) =>
        update({ rows: state.rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)) });
    const addRow = () => update({ rows: [...state.rows, newRow()] });
    const removeRow = (id) => {
        if (state.rows.length <= 1) {
            return;
        }
        update({ rows: state.rows.filter((r) => r.id !== id) });
    };

    const formTemplate = () => {
        const def = findAuthType(state.type);
        const canRemove = state.rows.length > 1;
        return html`
            <div class="set-auth-form">
                <div class="mb-3">
                    <label class="form-label" for="auth-type">${labels.get('modal.auth.type')}</label>
                    <select class="form-select" id="auth-type"
                        .value=${state.type}
                        @change=${(e) => setType(e.target.value)}>
                        ${AUTH_TYPES.map((t) => html`<option value="${t.value}">${t.label}</option>`)}
                    </select>
                    <div class="form-text">${def.hint}</div>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="auth-host">${labels.get('modal.auth.host')}</label>
                    <input type="text" class="form-control" id="auth-host"
                        placeholder="${def.hostPlaceholder}"
                        .value=${state.host}
                        @input=${(e) => { state.host = e.target.value; }}
                        required>
                </div>
                ${def.multiRow
                    ? html`
                        <div id="auth-header-rows">
                            ${repeat(state.rows, (r) => r.id, (row) => html`
                                <div class="header-row d-flex gap-2 mb-2 align-items-start">
                                    ${def.rowFields.map((f) => html`
                                        <div class="flex-fill">
                                            <input type="${f.type}"
                                                class="form-control form-control-sm auth-header-field"
                                                data-field="${f.key}"
                                                placeholder="${f.placeholder || f.label}"
                                                .value=${row[f.key] ?? ''}
                                                @input=${(e) => setRowField(row.id, f.key, e.target.value)}>
                                            ${f.description ? html`<div class="form-text" style="font-size: 0.75rem;">${f.description}</div>` : nothing}
                                        </div>
                                    `)}
                                    <button type="button"
                                        class="btn btn-sm ${canRemove ? 'btn-danger' : 'btn-default'} remove-header-row"
                                        ?disabled=${!canRemove}
                                        title="${canRemove ? labels.get('modal.auth.header.remove.title') : labels.get('modal.auth.header.removeLast.title')}"
                                        @click=${() => removeRow(row.id)}>
                                        <span aria-hidden="true">&times;</span>
                                    </button>
                                </div>
                            `)}
                        </div>
                        <button type="button" class="btn btn-sm btn-default mt-1" id="auth-add-header-row"
                            @click=${() => addRow()}>${labels.get('modal.auth.header.add')}</button>
                        <div class="form-text mt-1">${labels.get('modal.auth.header.hint')}</div>
                    `
                    : html`
                        ${def.fields.map((f) => html`
                            <div class="mb-3">
                                <label class="form-label">${f.label}</label>
                                <input type="${f.type}" class="form-control auth-field"
                                    data-key="${f.key}"
                                    placeholder="${f.placeholder || ''}"
                                    .value=${state.fields[f.key] ?? ''}
                                    @input=${(e) => setField(f.key, e.target.value)}
                                    required>
                                ${f.description ? html`<div class="form-text">${f.description}</div>` : nothing}
                            </div>
                        `)}
                    `}
            </div>
        `;
    };

    const modalEl = Modal.advanced({
        title: labels.get('modal.auth.title'),
        content: html`<div class="package-manager-auth-mount"></div>`,
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
                text: labels.get('modal.button.saveCredentials'),
                btnClass: 'btn-primary',
                name: 'save',
                trigger: async (_e, modal) => {
                    const def = findAuthType(state.type);
                    const host = (state.host ?? '').trim();
                    if (!host) {
                        Notification.warning(labels.get('notification.warning'), labels.get('modal.auth.validation.hostRequired'));
                        return;
                    }
                    let credentials;
                    if (def?.multiRow) {
                        const headers = state.rows
                            .map((r) => ({ name: (r.name ?? '').trim(), value: r.value ?? '' }))
                            .filter((h) => h.name !== '');
                        if (headers.length === 0) {
                            Notification.warning(labels.get('notification.warning'), labels.get('modal.auth.validation.headerRequired'));
                            return;
                        }
                        credentials = { headers };
                    } else {
                        credentials = { ...state.fields };
                    }
                    modal.hideModal();
                    try {
                        const data = await setAuth({ type: state.type, host, credentials });
                        if (data.status === 'ok') {
                            Notification.success(labels.get('notification.success'), labels.get('modal.auth.save.success', [host]));
                            onSuccess?.();
                        } else {
                            Notification.error(labels.get('notification.error'), data.errorOutput || data.message || labels.get('modal.auth.save.error'));
                        }
                    } catch (error) {
                        console.error('Failed to set auth:', error);
                        Notification.error(labels.get('notification.error'), labels.get('modal.auth.save.error'));
                    }
                },
            },
        ],
    });

    const mount = () => {
        mountPoint = modalEl.querySelector('.package-manager-auth-mount');
        if (mountPoint) {
            render(formTemplate(), mountPoint);
        }
    };
    modalEl.addEventListener('typo3-modal-shown', mount, { once: true });
    queueMicrotask(() => {
        if (!mountPoint) {
            mount();
        }
    });
}

export function openRemoveAuthModal(type, host, onSuccess) {
    Modal.advanced({
        title: labels.get('modal.auth.remove.title'),
        content: html`<p>${labels.get('modal.auth.remove.confirm', [type, host])}</p>`,
        size: Modal.sizes.small,
        severity: SeverityEnum.warning,
        buttons: [
            {
                text: labels.get('modal.button.cancel'),
                btnClass: 'btn-default',
                name: 'cancel',
                trigger: (_e, modal) => modal.hideModal(),
            },
            {
                text: labels.get('modal.button.remove'),
                btnClass: 'btn-danger',
                name: 'remove',
                trigger: async (_e, modal) => {
                    modal.hideModal();
                    try {
                        const data = await removeAuth({ type, host });
                        if (data.status === 'ok') {
                            Notification.success(labels.get('notification.success'), labels.get('modal.auth.remove.success', [host]));
                            onSuccess?.();
                        } else {
                            Notification.error(labels.get('notification.error'), data.errorOutput || labels.get('modal.auth.remove.error'));
                        }
                    } catch (error) {
                        console.error('Failed to remove auth:', error);
                        Notification.error(labels.get('notification.error'), labels.get('modal.auth.remove.error'));
                    }
                },
            },
        ],
    });
}
