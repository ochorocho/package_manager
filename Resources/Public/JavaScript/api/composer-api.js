import AjaxRequest from '@typo3/core/ajax/ajax-request.js';
import { url } from './ajax-urls.js';

/**
 * AJAX wrapper for the composer-info, dependency-tree and cache endpoints.
 */

export async function fetchComposerInfo() {
    const response = await new AjaxRequest(url('composer_info')).get();
    return response.resolve();
}

export async function fetchDependencyTree() {
    const response = await new AjaxRequest(url('dependency_tree')).get();
    return response.resolve();
}

export async function clearCaches() {
    const response = await new AjaxRequest(url('clear_cache')).post({});
    return response.resolve();
}
