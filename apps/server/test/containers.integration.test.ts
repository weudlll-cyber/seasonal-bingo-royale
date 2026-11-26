/**
 * @file   apps/server/test/containers.integration.test.ts
 * @module server/test
 * @brief  The production containers carry the hardening settings (kit K89).
 *
 * Responsibility: ops/compose.yml as Docker Compose reads it, held to the kit's list
 *                 (`findWeakContainers`): the app and the migrate step run the game's code, the
 *                 database its four needed capabilities only; Caddy, the standalone TLS proxy,
 *                 is named as unchecked with the reason.
 * Depends on:     vitest, node:child_process, @seasonal/kit/testing, docker compose
 * Spec:           docs/spec/09-deployment-architecture.md §2; docs/spec/08-devops-architecture.md §4
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { findWeakContainers } from '@seasonal/kit/testing';
import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));

// The variables the file demands; their values do not matter to the settings.
const ENV = {
  SBR_IMAGE: 'sbr-app:test',
  // Read beside the compose file.
  SBR_ENV_FILE: '.env.dev.example',
  DATABASE_URL: 'postgres://sbr@postgres:5432/sbr',
  POSTGRES_PASSWORD: 'unused',
};

describe('the production containers', () => {
  it('carry the hardening settings', { timeout: 60_000 }, () => {
    const args = ['compose', '-f', 'ops/compose.yml', '--profile', 'standalone'];
    const r = spawnSync('docker', [...args, 'config', '--format', 'json'], {
      cwd: REPO,
      env: { ...process.env, ...ENV },
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    expect(
      findWeakContainers(JSON.parse(r.stdout) as unknown, {
        services: {
          app: 'app',
          migrate: 'app',
          postgres: 'database',
          caddy: { unchecked: "the standalone TLS proxy, not the game's code; ports 80 and 443" },
        },
      }),
    ).toEqual([]);
  });
});
