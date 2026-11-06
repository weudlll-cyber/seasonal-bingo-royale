/**
 * @file   e2e/devStack.ts
 * @module e2e
 * @brief  Ports and database URL of the local dev stack, read from ops/.env.dev.example.
 *
 * Responsibility: one place for the project's fixed ports (server 3900, player client
 *                 5390) and the DATABASE_URL built from the dev env file, so the e2e
 *                 config never repeats credentials. CI sets SBR_E2E_DATABASE_URL to its
 *                 PostgreSQL service instead.
 * Depends on:     ops/.env.dev.example
 * Used by:        ./playwright.config.ts, ./globalSetup.ts, ./screens
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

// Mailpit, where the e2e server sends its mail (password reset, D60): CI's service
// (SBR_E2E_SMTP_HOST, SBR_E2E_SMTP_PORT, SBR_E2E_MAILPIT_URL), else the dev stack's.
export function mailpit(): { smtpHost: string; smtpPort: string; apiUrl: string } {
  const host = process.env['SBR_E2E_SMTP_HOST'];
  if (host !== undefined) {
    return {
      smtpHost: host,
      smtpPort: process.env['SBR_E2E_SMTP_PORT'] ?? '1025',
      apiUrl: process.env['SBR_E2E_MAILPIT_URL'] ?? `http://${host}:8025`,
    };
  }
  const env = readEnvFile();
  return {
    smtpHost: '127.0.0.1',
    smtpPort: env.get('SBR_DEV_MAILPIT_SMTP_PORT') ?? '1090',
    apiUrl: `http://127.0.0.1:${env.get('SBR_DEV_MAILPIT_UI_PORT') ?? '8490'}`,
  };
}

// The database the e2e server uses: CI's service (SBR_E2E_DATABASE_URL), else the dev stack.
export const externalDatabase = (): string | undefined => process.env['SBR_E2E_DATABASE_URL'];

export function databaseUrl(): string {
  const external = externalDatabase();
  if (external !== undefined) return external;
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
