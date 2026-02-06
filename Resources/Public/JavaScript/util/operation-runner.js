import Notification from '@typo3/backend/notification.js';
import labels from '~labels/package_manager.module';
import { postOperation } from '@typo3/package-manager/api/package-api.js';
import { EVENTS } from '@typo3/package-manager/util/constants.js';
import {
    showDryRunModal,
    showOperationErrorModal,
} from '@typo3/package-manager/util/operation-modal.js';

/**
 * Single shared lock so concurrent components can't double-trigger an
 * operation. The DOM is the source of truth — child components disable
 * their action buttons based on the `package-manager-operation-busy`
 * attribute on `<html>`.
 */
const BUSY_ATTR = 'data-package-manager-busy';

function setBusy(busy) {
    if (busy) {
        document.documentElement.setAttribute(BUSY_ATTR, '');
    } else {
        document.documentElement.removeAttribute(BUSY_ATTR);
    }
}

export function isBusy() {
    return document.documentElement.hasAttribute(BUSY_ATTR);
}

/**
 * Run a composer operation with a two-step dry-run → confirm flow.
 *
 * On success, dispatches `typo3:package-manager:operation-completed` on
 * `document` so any open child component can refetch its data.
 *
 * @param kind                  composer route key: 'require' | 'update' | 'remove'
 * @param packageName           primary package name
 * @param actionLabel           user-facing verb ('Install', 'Update', …)
 * @param additionalPackages    extra packages to apply the operation to
 * @returns true if the operation completed successfully, false otherwise.
 */
export async function runOperation(kind, packageName, actionLabel, additionalPackages = []) {
    if (isBusy()) {
        return false;
    }
    setBusy(true);

    const allPackages = [packageName, ...additionalPackages];
    const displayName = additionalPackages.length > 0
        ? `${packageName} (+${additionalPackages.length} suggested)`
        : packageName;

    try {
        const dryRunData = await postOperation(kind, {
            package: allPackages.join(' '),
            dryRun: true,
        });

        const choice = await showDryRunModal({ dryRunData, actionLabel, displayName });
        if (choice !== 'confirm') {
            return false;
        }

        Notification.info(
            labels.get('operation.progress.title'),
            labels.get('operation.progress.message', [actionLabel, displayName]),
            0,
        );

        const data = await postOperation(kind, {
            package: allPackages.join(' '),
            dryRun: false,
            confirmed: true,
        });

        if (data.status === 'ok') {
            Notification.success(labels.get('notification.success'), buildSuccessMessage(actionLabel, data));
            document.dispatchEvent(
                new CustomEvent(EVENTS.OPERATION_COMPLETED, {
                    detail: { kind, packageName, additionalPackages, success: true },
                })
            );
            return true;
        }

        showOperationErrorModal({ actionLabel, data });
        Notification.error(
            labels.get('notification.error'),
            labels.get('operation.failure.message', [actionLabel, data.errorOutput || labels.get('operation.failure.unknown')]),
        );
        document.dispatchEvent(
            new CustomEvent(EVENTS.OPERATION_COMPLETED, {
                detail: { kind, packageName, additionalPackages, success: false },
            })
        );
        return false;
    } catch (error) {
        console.error('Operation failed:', error);
        Notification.error(labels.get('notification.error'), labels.get('operation.failure.generic', [actionLabel]));
        return false;
    } finally {
        setBusy(false);
    }
}

function buildSuccessMessage(actionLabel, data) {
    if (!data.extensionSetupRan) {
        return labels.get('operation.success.default', [actionLabel]);
    }
    const setupOk = data.extensionSetupSuccess;
    const cacheOk = data.cacheFlushSuccess !== false;
    if (setupOk && cacheOk) {
        return labels.get('operation.success.setupAndCache', [actionLabel]);
    }
    if (setupOk) {
        return labels.get('operation.success.setupOnly', [actionLabel]);
    }
    return labels.get('operation.success.setupWarn', [actionLabel]);
}
