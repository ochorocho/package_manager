import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Reset filesystem state that the e2e tests mutate so each suite run
 * starts from a known state:
 *
 *   - drop any leftover `e2e-*` repositories from Build/composer.json
 *   - delete Build/auth.json (auth credentials added during tests)
 *
 * These files live inside DDEV's web container at /var/www/html/Build/,
 * which is the host path resolved relative to this file.
 */
export default async function globalSetup(): Promise<void> {
    const projectRoot = resolve(__dirname, '..', '..');
    const buildDir = resolve(projectRoot, 'Build');

    const composerJson = resolve(buildDir, 'composer.json');
    if (existsSync(composerJson)) {
        const data = JSON.parse(readFileSync(composerJson, 'utf8')) as {
            repositories?: Array<Record<string, unknown> | unknown>;
        };
        if (Array.isArray(data.repositories)) {
            const cleaned = data.repositories.filter((repo) => {
                if (typeof repo !== 'object' || repo === null) {
                    return true;
                }
                const name = (repo as { name?: unknown }).name;
                return !(typeof name === 'string' && name.startsWith('e2e-'));
            });
            if (cleaned.length !== data.repositories.length) {
                data.repositories = cleaned;
                writeFileSync(composerJson, JSON.stringify(data, null, 4) + '\n');
            }
        }
    }

    const authJson = resolve(buildDir, 'auth.json');
    if (existsSync(authJson)) {
        unlinkSync(authJson);
    }
}
