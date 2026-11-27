/**
 * @file   e2e/devStack.ts
 * @module e2e
 * @brief  The tests' ports, data folder and PostgreSQL, from ops/.env.dev.example.
 *
 * Responsibility: one place for the browser tests' fixed ports (server 3901, player client 5392:
 *                 apart from `pnpm dev`'s 3900 and 5390, so a run never meets the developer's
 *                 own server), their database's name and data folder, and the URL of a database
 *                 on the PostgreSQL they use, built from the dev env file so no credentials are
 *                 repeated. CI sets SBR_E2E_DATABASE_URL to its PostgreSQL service instead.
 * Depends on:     ops/.env.dev.example
 * Used by:        ./playwright.config.ts, ./testServer, ./testDatabase, ./screens and the specs
 * Spec:           docs/spec/08-devops-architecture.md §1.1, §8
 */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const ENV_FILE = 'ops/.env.dev.example';
export const COMPOSE_FILE = 'ops/compose.dev.yml';
export const SERVER_URL = 'http://127.0.0.1:3901';
export const CLIENT_URL = 'http://127.0.0.1:5392';
// The test server's database and data folder (the maintenance flag is a file in it).
export const TEST_DATABASE = 'sbr_e2e';
export const TEST_DATA_DIR = path.join(tmpdir(), 'sbr-e2e-data');
export const MAINTENANCE_FLAG = path.join(TEST_DATA_DIR, 'maintenance');

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

// The tests' PostgreSQL: CI's service (SBR_E2E_DATABASE_URL), else the dev stack's.
export const externalDatabase = (): string | undefined => process.env['SBR_E2E_DATABASE_URL'];

// The URL of the database `name` on it.
export function databaseUrl(name: string): string {
  const url = new URL(externalDatabase() ?? devStackUrl());
  url.pathname = `/${name}`;
  return url.toString();
}

function devStackUrl(): string {
  const env = readEnvFile();
  const get = (key: string): string => {
    const value = env.get(key);
    if (value === undefined) throw new Error(`${ENV_FILE} has no ${key}`);
    return value;
  };
  const user = encodeURIComponent(get('POSTGRES_USER'));
  const password = encodeURIComponent(get('POSTGRES_PASSWORD'));
  return `postgres://${user}:${password}@127.0.0.1:${get('SBR_DEV_POSTGRES_PORT')}`;
}
