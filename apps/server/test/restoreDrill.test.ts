/**
 * @file   apps/server/test/restoreDrill.test.ts
 * @module server/test
 * @brief  Bingo's drill waits for its throw-away database over TCP (kit OPERATIONS.md).
 *
 * Responsibility: ops/lib/backup.sh `drill_database` with docker stood in by a shell function: a
 *                 new database's first, temporary server answers on the socket and then shuts
 *                 down, so only a TCP answer counts.
 * Depends on:     vitest, node:child_process, ops/lib/common.sh, ops/lib/backup.sh
 * Spec:           docs/spec/09-deployment-architecture.md §6
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));

describe("Bingo's drill", { timeout: 30_000 }, () => {
  it('asks its database over TCP and adds no fixed pause', () => {
    const script = [
      'set -euo pipefail',
      'source ops/lib/common.sh',
      'source ops/lib/backup.sh',
      'cleanup_container() { :; }',
      'sleep() { echo "sleep $*"; }',
      'docker() { [[ $1 != exec ]] || echo "asked $*" >&3; }',
      'drill_database sbr-drill-test 3>&1',
    ].join('\n');
    const r = spawnSync('bash', ['-c', script], { cwd: REPO, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('pg_isready -h 127.0.0.1');
    expect(r.stdout).not.toContain('sleep');
  });
});
