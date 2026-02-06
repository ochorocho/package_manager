/**
 * Shared identifiers used across the Package Manager modules.
 */

export const TAB_IDS = Object.freeze({
    INSTALLED: 'installed',
    SEARCH: 'search',
    COMPOSER: 'composer',
    DEPENDENCIES: 'dependencies',
    REPOSITORIES: 'repositories',
});

export const EVENTS = Object.freeze({
    OPERATION_COMPLETED: 'typo3:package-manager:operation-completed',
    PACKAGES_CHANGED: 'typo3:package-manager:packages-changed',
    REPOSITORIES_CHANGED: 'typo3:package-manager:repositories-changed',
    AUTH_CHANGED: 'typo3:package-manager:auth-changed',
});

/**
 * Default debounce delay (ms) for the search input.
 */
export const SEARCH_DEBOUNCE_MS = 250;
