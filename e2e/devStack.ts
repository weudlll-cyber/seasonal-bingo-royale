/**
 * @file   e2e/devStack.ts
 * @module e2e
 * @brief  Ports and database URL of the local dev stack, read from ops/.env.dev.example.
 *
 * Responsibility: one place for the project's fixed ports (server 3900, player client
 *                 5390) and the DATABASE_URL built from the dev env file, so the e2e
 *                 config never repeats credentials.
 * Depends on:     ops/.env.dev.example
 * Used by:        ./playwright.config.ts, ./globalSetup.ts, ./acceptance/acceptance.spec,
 *                 ./screens, ./showcase.spec
 * Spec:           docs/spec/08-devops-architecture.md §1, §8
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const ENV_FILE = 'ops/.env.dev.example';
export const COMPOSE_FILE = 'ops/compose.dev.yml';
export const SERVER_URL = 'http://127.0.0.1:3900';
export const CLIENT_URL = 'http://127.0.0.1:5390';

function readEnvFile(): Map<string, string> {
  const text = readFileSync(new URL(`../${ENV_FILE}`, import.meta.url), 'utf8');
  const entries = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)] as const;
    });
  return new Map(entries);
}

export function databaseUrl(): string {
  const env = readEnvFile();
  const get = (key: string): string => {
    const value = env.get(key);
    if (value === undefined) throw new Error(`${ENV_FILE} has no ${key}`);
    return value;
  };
  const user = encodeURIComponent(get('POSTGRES_USER'));
  const password = encodeURIComponent(get('POSTGRES_PASSWORD'));
  return `postgres://${user}:${password}@127.0.0.1:${get('SBR_DEV_POSTGRES_PORT')}/${get('POSTGRES_DB')}`;
}
