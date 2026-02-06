/**
 * Single source of truth for resolving the Package Manager AJAX endpoints
 * registered in Configuration/Backend/AjaxRoutes.php.
 *
 * The TYPO3 backend exposes the routes as `TYPO3.settings.ajaxUrls.<key>`.
 * Touching that map directly throughout the codebase makes it hard to spot
 * a typo or rename a route — so all lookups live here.
 */

const PREFIX = 'package_manager_';

/**
 * Look up the configured AJAX URL for a route key (without the prefix).
 *
 * @example
 *   url('installed')           // → /typo3/ajax/package-manager/installed
 *   url('require')             // → /typo3/ajax/package-manager/require
 *
 * @throws if the URL is missing — that means the route is not registered.
 */
export function url(key) {
    const ajaxUrls = (window.TYPO3?.settings?.ajaxUrls) ?? {};
    const fullKey = PREFIX + key;
    const value = ajaxUrls[fullKey];
    if (typeof value !== 'string' || value === '') {
        throw new Error(`Package Manager AJAX route "${fullKey}" is not registered.`);
    }
    return value;
}

/**
 * Convenience: resolve the URL for a composer operation by its kind.
 *
 * Maps directly onto Configuration/Backend/AjaxRoutes.php route keys
 * (`require`, `update`, `remove`).
 */
export function operationUrl(kind) {
    return url(kind);
}
