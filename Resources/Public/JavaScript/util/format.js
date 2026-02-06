/**
 * Small formatting helpers shared across components.
 */

const ACTION_BADGE_CLASSES = {
    installing: 'badge-success',
    updating: 'badge-info',
    downgrading: 'badge-warning',
    removing: 'badge-danger',
};

/**
 * Map a composer operation action verb (`installing`, `updating`, …) to the
 * appropriate TYPO3 backend badge class. Falls back to `badge-default`.
 */
export function actionBadgeClass(action) {
    return ACTION_BADGE_CLASSES[action] ?? 'badge-default';
}

/**
 * Compact a number to k/M for tight UI labels (e.g. download counts).
 */
export function formatCount(num) {
    if (num >= 1_000_000) {
        return (num / 1_000_000).toFixed(1) + 'M';
    }
    if (num >= 1_000) {
        return (num / 1_000).toFixed(1) + 'K';
    }
    return String(num);
}
