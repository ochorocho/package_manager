/**
 * Authentication type definitions for the composer auth.json modal.
 *
 * Mirrors the auth strategies documented at
 *   https://getcomposer.org/doc/articles/authentication-for-private-packages.md
 *
 * Each entry describes how to render the credential form for that type
 * and which keys the backend `RepositoryService::setAuth()` expects.
 */
export const AUTH_TYPES = Object.freeze([
    {
        value: 'http-basic',
        label: 'HTTP Basic',
        defaultHost: '',
        hostPlaceholder: 'repo.example.org',
        hint: 'Username and password for HTTP repositories.',
        fields: [
            { key: 'username', label: 'Username', type: 'text' },
            { key: 'password', label: 'Password', type: 'password' },
        ],
    },
    {
        value: 'bearer',
        label: 'Bearer Token',
        defaultHost: '',
        hostPlaceholder: 'repo.example.org',
        hint: 'Bearer token for token-based authentication.',
        fields: [{ key: 'token', label: 'Token', type: 'password' }],
    },
    {
        value: 'github-oauth',
        label: 'GitHub OAuth',
        defaultHost: 'github.com',
        hostPlaceholder: 'github.com',
        hint: 'Personal access token or fine-grained token from GitHub.',
        fields: [{ key: 'token', label: 'Token', type: 'password' }],
    },
    {
        value: 'gitlab-oauth',
        label: 'GitLab OAuth',
        defaultHost: 'gitlab.com',
        hostPlaceholder: 'gitlab.com',
        hint: 'OAuth token for GitLab. Requires gitlab-domains config for private instances.',
        fields: [{ key: 'token', label: 'Token', type: 'password' }],
    },
    {
        value: 'gitlab-token',
        label: 'GitLab Deploy/Personal Token',
        defaultHost: 'gitlab.com',
        hostPlaceholder: 'gitlab.com',
        hint: 'Deploy or personal access token with read_api scope.',
        fields: [{ key: 'token', label: 'Token', type: 'password' }],
    },
    {
        value: 'bitbucket-oauth',
        label: 'Bitbucket OAuth',
        defaultHost: 'bitbucket.org',
        hostPlaceholder: 'bitbucket.org',
        hint: 'OAuth consumer key and secret from Atlassian.',
        fields: [
            { key: 'consumer-key', label: 'Consumer Key', type: 'text' },
            { key: 'consumer-secret', label: 'Consumer Secret', type: 'password' },
        ],
    },
    {
        value: 'forgejo-token',
        label: 'Forgejo Token',
        defaultHost: '',
        hostPlaceholder: 'forgejo.example.org',
        hint: 'Username and access token with read:repository scope.',
        fields: [
            { key: 'username', label: 'Username', type: 'text' },
            { key: 'token', label: 'Access Token', type: 'password' },
        ],
    },
    {
        value: 'custom-headers',
        label: 'Custom Header',
        defaultHost: '',
        hostPlaceholder: 'repo.example.org',
        hint: 'Custom HTTP headers sent with every Composer request to this host. You can add multiple headers.',
        multiRow: true,
        rowFields: [
            {
                key: 'name', label: 'Header Name', type: 'text', placeholder: 'API-TOKEN',
                description: 'HTTP header name, e.g. API-TOKEN, Authorization, X-Auth-Key.',
            },
            {
                key: 'value', label: 'Header Value', type: 'password', placeholder: 'your-secret-value',
                description: 'Header value. Example: a plain API key or "Bearer abc123".',
            },
        ],
        fields: [],
    },
]);

export function findAuthType(value) {
    return AUTH_TYPES.find((t) => t.value === value);
}

export const AUTH_TYPE_DEFAULT_HOSTS = Object.freeze(
    AUTH_TYPES.map((t) => t.defaultHost).filter((h) => h !== '')
);
