import AjaxRequest from '@typo3/core/ajax/ajax-request.js';
import { url, operationUrl } from './ajax-urls.js';

/**
 * Thin wrapper around the package-related AJAX endpoints.
 *
 * Every method returns the parsed JSON payload (the same shape the
 * controller produces). Failures bubble up as the AjaxRequest errors —
 * callers decide how to surface them.
 */

export async function fetchInstalledPackages() {
    const response = await new AjaxRequest(url('installed')).get();
    return response.resolve();
}

/**
 * Fetch the cached `composer outdated` map for every installed package.
 * Pass `{ force: true }` to bypass the server-side cache (used by the
 * "Check for updates" button).
 */
export async function fetchOutdatedPackages({ force = false } = {}) {
    const request = new AjaxRequest(url('outdated'));
    const response = await (force
        ? request.withQueryArguments({ force: '1' }).get()
        : request.get());
    return response.resolve();
}

export async function fetchPackageInfo(packageName) {
    const response = await new AjaxRequest(url('package_info'))
        .withQueryArguments({ package: packageName })
        .get();
    return response.resolve();
}

export async function fetchSuggestions(packageName) {
    const response = await new AjaxRequest(url('suggestions'))
        .withQueryArguments({ package: packageName })
        .get();
    return response.resolve();
}

export async function searchPackages(query, page = 1) {
    const response = await new AjaxRequest(url('search'))
        .withQueryArguments({ q: query, page })
        .get();
    return response.resolve();
}

/**
 * POST a require/update/remove operation. `kind` matches the route key,
 * `body` is whatever the endpoint expects (package name, dryRun flag…).
 */
export async function postOperation(kind, body) {
    const response = await new AjaxRequest(operationUrl(kind)).post(body);
    return response.resolve();
}
