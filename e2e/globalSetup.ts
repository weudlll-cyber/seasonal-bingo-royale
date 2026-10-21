/**
 * @file   e2e/globalSetup.ts
 * @module e2e
 * @brief  Starts PostgreSQL through the dev compose file before the server boots.
 *
 * Responsibility: run `docker compose --env-file ops/.env.dev.example -f
 *                 ops/compose.dev.yml up -d --wait`, so the server's migrations find
 *                 their database. A stack that is already up is left as it is.
 * Depends on:     ./devStack, docker
 * Used by:        ./playwright.config.ts
 * Spec:           docs/spec/08-devops-architecture.md §1, docs/spec/12-testing-strategy.md §4
 */
import { execFileSync } from 'node:child_process';

import { COMPOSE_FILE, ENV_FILE, REPO_ROOT } from './devStack.js';

export default function globalSetup(): void {
  execFileSync(
    'docker',
    ['compose', '--env-file', ENV_FILE, '-f', COMPOSE_FILE, 'up', '-d', '--wait', 'postgres'],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );
}
