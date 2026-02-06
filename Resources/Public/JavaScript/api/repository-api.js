import AjaxRequest from '@typo3/core/ajax/ajax-request.js';
import { url } from './ajax-urls.js';

/**
 * AJAX wrapper for the repository + authentication endpoints. The
 * controller returns combined data for the Repositories tab — both the
 * configured composer repositories and the project's auth.json entries —
 * via the single "repositories" endpoint.
 */

export async function fetchRepositoriesAndAuth() {
    const response = await new AjaxRequest(url('repositories')).get();
    return response.resolve();
}

export async function addRepository({ name, type, url: repoUrl }) {
    const response = await new AjaxRequest(url('add_repository')).post({
        name,
        type,
        url: repoUrl,
    });
    return response.resolve();
}

export async function removeRepository(name) {
    const response = await new AjaxRequest(url('remove_repository')).post({ name });
    return response.resolve();
}

export async function setAuth({ type, host, credentials }) {
    const response = await new AjaxRequest(url('auth_set')).post({
        type,
        host,
        credentials,
    });
    return response.resolve();
}

export async function removeAuth({ type, host }) {
    const response = await new AjaxRequest(url('auth_remove')).post({ type, host });
    return response.resolve();
}
