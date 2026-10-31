/**
 * @file   apps/server/test/matchPersistence.integration.test.ts
 * @module server/test
 * @brief  Match persistence and the scheduler survive a restart mid-match (WP-10).
 *
 * Responsibility: the host creates a classic match over HTTP, a player joins, bots fill it
 *                 to 20, it starts; server A runs timed draws, then stops mid-match; server
 *                 B on the same database picks the scheduled work up and draws on. No event
 *                 is lost or duplicated (seq 1..N without gaps, each round's draws follow
 *                 its sequence, every draw's speed window closes before the next draw), the
 *                 snapshot plus tail rebuilds the same state as a full replay, bots' marks
 *                 are projected, the event log rejects changes, a stale writer is refused,
 *                 marks older than 90 days are purged, the next round's start time during
 *                 the pause between rounds survives a restart (event log), and a match set
 *                 to start at a time starts then on a server that came up after it was set.
 * Depends on:     vitest, ./harness, ./session, @sbr/domain, ../src/match/*, ../src/index
 * Spec:           docs/spec/02-software-architecture.md §5.2–§5.4; docs/spec/04-database-design.md §3.3
 */
import { createInitialMatchState, evolve, type DomainEvent } from '@sbr/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { App } from '../src/index.js';
import { VersionConflict } from '../src/match/pgMatchStore.js';
import { purgeOldMarks } from '../src/match/retention.js';
import { buildOn, startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { signIn, type Client } from './session.js';

let harness: Harness;
let matchId = '';

beforeAll(async () => {
  harness = await startHarness();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

async function drawCount(): Promise<number> {
  const r = await harness.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM sbr.match_events WHERE match_id = $1 AND type = 'drawMade'`,
    [matchId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

async function waitForDraws(n: number, timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  while ((await drawCount()) < n) {
    if (Date.now() > until) throw new Error(`fewer than ${String(n)} draws`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function setUpMatch(app: App): Promise<void> {
  const host: Client = await signIn(app.fastify, 'host');
  const created = await host.post('/api/v1/matches', {
    title: 'Restart test',
    gameType: 'classic',
    prizes: ['fullCard'],
    drawMode: 'auto',
    drawIntervalMs: 4_000,
    missedNumbers: { kind: 'autoMarkAfter', delayMs: 3_000 },
    maxPlayers: 20,
  });
  expect(created.statusCode).toBe(201);
  const { code, id } = created.json<{ code: string; id: string }>();
  matchId = id;
  const player = await signIn(app.fastify, 'player-1');
  expect((await player.post(`/api/v1/matches/${code}/join`, {})).statusCode).toBe(204);
  expect((await host.post(`/api/v1/matches/${code}/bots`, { upTo: 20 })).statusCode).toBe(200);
  await app.match.engine.start(id, 0);
}

describe('restart mid-match', () => {
  it('continues on a second server without losing or doubling an event', async () => {
    const a = harness.built;
    await setUpMatch(a);
    await a.match.startScheduler();
    await waitForDraws(3, 30_000);
    await a.match.scheduler.stop();
    const before = await drawCount();
    const b = await buildOn(harness.pool, harness.container.getConnectionUri());
    await b.match.startScheduler();
    await waitForDraws(before + 3, 40_000);
    await b.match.scheduler.stop();
    await b.fastify.close();
    const events = await a.match.store.events(matchId, 0);
    expect(events.map((e) => e.seq)).toEqual(events.map((_e, i) => i + 1));
    checkDrawOrder(events.map((e) => e.event));
  }, 120_000);

  it('rebuilds the same state from snapshot plus tail as from a full replay', async () => {
    const loaded = await harness.built.match.store.load(matchId);
    const events = await harness.built.match.store.events(matchId, 0);
    const replayed = events.reduce((s, e) => evolve(s, e.event), createInitialMatchState());
    expect(loaded?.seq).toBe(events.length);
    // jsonb reorders object keys, so compare values, not strings.
    expect(loaded?.state).toEqual(replayed);
    const snaps = await harness.pool.query(
      'SELECT seq FROM sbr.match_snapshots WHERE match_id = $1',
      [matchId],
    );
    expect(snaps.rowCount).toBeGreaterThan(0);
  });
});

describe('projections, log and retention', () => {
  it('projects marks, keeps the log append-only and refuses a stale writer', async () => {
    const marks = await harness.pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM sbr.marks WHERE match_id = $1 AND source = 'auto'`,
      [matchId],
    );
    expect(Number(marks.rows[0]?.n)).toBeGreaterThan(0);
    await expect(
      harness.pool.query(`UPDATE sbr.match_events SET type = 'x' WHERE match_id = $1`, [matchId]),
    ).rejects.toThrow(/append-only/);
    const loaded = await harness.built.match.store.load(matchId);
    if (loaded === null) throw new Error('match missing');
    await expect(
      harness.built.match.store.append({
        matchId,
        expectedSeq: loaded.seq - 1,
        events: [{ type: 'matchAborted', reason: 'stale' }],
        stateAfter: loaded.state,
        at: Date.now(),
        actorAccountId: null,
        mark: null,
      }),
    ).rejects.toBeInstanceOf(VersionConflict);
  });

  it('purges marks older than 90 days and keeps newer ones', async () => {
    await harness.pool.query(
      `UPDATE sbr.marks SET received_at = now() - interval '91 days'
        WHERE ctid = (SELECT ctid FROM sbr.marks WHERE match_id = $1 LIMIT 1)`,
      [matchId],
    );
    expect(await purgeOldMarks(harness.pool)).toBe(1);
    expect(await purgeOldMarks(harness.pool)).toBe(0);
  });
});

// Every round's draws follow its sequence from index 0, and each draw's speed window
// closes before the next draw.
function checkDrawOrder(events: readonly DomainEvent[]): void {
  let sequence: readonly number[] = [];
  let next = 0;
  let windowOpen = false;
  for (const e of events) {
    if (e.type === 'roundStarted') {
      sequence = e.drawSequence;
      next = 0;
    } else if (e.type === 'drawMade') {
      expect(windowOpen).toBe(false);
      expect(e.drawIndex).toBe(next);
      expect(e.item).toBe(sequence[next]);
      next += 1;
      windowOpen = true;
    } else if (e.type === 'speedWindowClosed') {
      expect(e.drawIndex).toBe(next - 1);
      windowOpen = false;
    }
  }
  expect(next).toBeGreaterThanOrEqual(6);
}

// Plays the current round to its end straight through the engine: each draw, then the
// close of its speed window (no waiting for the clock).
async function playRoundToEnd(app: App, id: string): Promise<void> {
  const engine = app.match.engine;
  for (let i = 0; i < 80; i += 1) {
    const round = (await engine.runner.current(id)).state.currentRound;
    if (round === null || round.ended) return;
    await engine.handle({ matchId: id, kind: 'draw', dueAt: Date.now() });
    const drawIndex = ((await engine.runner.current(id)).state.currentRound?.draws.length ?? 0) - 1;
    await engine.handle({ matchId: id, kind: 'close_speed_window', dueAt: Date.now(), drawIndex });
  }
}

describe('pause between rounds across a restart', () => {
  it('keeps the next round start time after a restart during the pause', async () => {
    const a = harness.built;
    const host = await signIn(a.fastify, 'host');
    const created = await host.post('/api/v1/matches', {
      title: 'Pause restart',
      gameType: 'royale',
      drawMode: 'host',
      missedNumbers: { kind: 'noAutoMark' },
      maxPlayers: 8,
      roundPause: { kind: 'wait', ms: 60_000 },
      testProfile: 'fast',
    });
    const { code, id } = created.json<{ code: string; id: string }>();
    await host.post(`/api/v1/matches/${code}/bots`, { upTo: 8 });
    await a.match.engine.start(id, 0);
    await a.match.engine.handle({ matchId: id, kind: 'start_match', dueAt: Date.now() });
    await playRoundToEnd(a, id);
    const before = (await host.get(`/api/v1/matches/${code}`)).json<{
      nextRoundAt: number | null;
    }>();
    expect(before.nextRoundAt).toBeGreaterThan(Date.now());
    // A second server on the same database stands for the restart: nothing in memory.
    const b = await buildOn(harness.pool, harness.container.getConnectionUri());
    const hostOnB = await signIn(b.fastify, 'host');
    const after = (await hostOnB.get(`/api/v1/matches/${code}`)).json<{
      nextRoundAt: number | null;
    }>();
    await b.fastify.close();
    expect(after.nextRoundAt).toBe(before.nextRoundAt);
  }, 120_000);
});

describe('start at a set time across a restart', () => {
  it('starts the match itself at its time on a server that came up after it was set', async () => {
    const a = harness.built;
    const host = await signIn(a.fastify, 'host');
    // At least a minute ahead (01 §7.6).
    const at = Date.now() + 61_000;
    const created = await host.post('/api/v1/matches', {
      title: 'Set time',
      gameType: 'classic',
      prizes: ['fullCard'],
      drawMode: 'host',
      missedNumbers: { kind: 'noAutoMark' },
      maxPlayers: 8,
      startRule: { kind: 'at', at },
    });
    const { code, id } = created.json<{ code: string; id: string }>();
    await host.post(`/api/v1/matches/${code}/bots`, { upTo: 4 });
    // Off by default; the host switches it on in the console.
    expect((await host.post(`/api/v1/matches/${code}/auto-start`, { auto: true })).statusCode).toBe(
      200,
    );
    // The running server shows the announced time and the automatic start (NIGHT-3: the rule
    // once showed 'host'); no countdown runs yet (D16).
    const summary = (await host.get(`/api/v1/matches/${code}`)).json<{
      startsAt: number | null;
      settings: { startRule: unknown };
    }>();
    expect(summary.startsAt).toBeNull();
    expect(summary.settings.startRule).toEqual({ kind: 'at', at, auto: true });
    // The restart: a new server on the same database, nothing in memory, its scheduler on.
    const b = await buildOn(harness.pool, harness.container.getConnectionUri());
    await b.match.startScheduler();
    const status = async () => (await b.match.store.load(id))?.record.status;
    expect((await b.match.store.load(id))?.record.settings.startRule).toEqual({
      kind: 'at',
      at,
      auto: true,
    });
    const until = Date.now() + 90_000;
    while ((await status()) !== 'running' && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await b.match.scheduler.stop();
    await b.fastify.close();
    expect(await status()).toBe('running');
    expect(Date.now()).toBeGreaterThanOrEqual(at);
  }, 180_000);
});
