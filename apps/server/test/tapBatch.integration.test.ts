/**
 * @file   apps/server/test/tapBatch.integration.test.ts
 * @module server/test
 * @brief  A batch of taps on PostgreSQL: one round trip, a stale one refused, none lost or doubled (12 §5).
 *
 * Responsibility: a tap is stored with one statement (events, version, entries, standings and
 *                 marks together; no separate BEGIN, version lock or COMMIT); a tap batch
 *                 written against a stale version is refused (VersionConflict) and leaves no
 *                 event and no mark behind; three players tapping every number of theirs while
 *                 the host keeps drawing, the taps racing the next draw and each other's
 *                 batches: every accepted tap is one `cellMarked` event and one manual `marks`
 *                 row whose speed bonus is the one the event scored, no tap is stored twice,
 *                 every refused one not at all, and the log has no gap. The match ends aborted.
 * Depends on:     vitest, pg, @sbr/application, ../src/match/pgMatchStore, ./harness, ./session
 * Spec:           docs/spec/12-testing-strategy.md §5; docs/spec/04-database-design.md §3.3;
 *                 docs/spec/06-realtime-architecture.md §4.1
 */
import { markKey, type MatchEngine } from '@sbr/application';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { VersionConflict } from '../src/match/pgMatchStore.js';
import { startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { signIn, type Client } from './session.js';

let h: Harness;
let engine: MatchEngine;
let id = '';
const players: { client: Client; accountId: string }[] = [];

beforeAll(async () => {
  h = await startHarness();
  engine = h.built.match.engine;
  const host = await signIn(h.built.fastify, 'host');
  const created = await host.post('/api/v1/matches', {
    title: 'Tap batches',
    gameType: 'classic',
    prizes: ['fullCard'],
    drawMode: 'host',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 12,
  });
  const { code } = created.json<{ code: string; id: string }>();
  id = created.json<{ id: string }>().id;
  for (const as of ['player-1', 'player-2', 'player-3'] as const) {
    const client = await signIn(h.built.fastify, as);
    expect((await client.post(`/api/v1/matches/${code}/join`, {})).statusCode).toBe(204);
    const session = (await client.get('/api/v1/session')).json<{ account: { id: string } }>();
    players.push({ client, accountId: session.account.id });
  }
  expect((await host.post(`/api/v1/matches/${code}/bots`, { upTo: 8 })).statusCode).toBe(200);
  await engine.start(id, 0);
  await engine.handle({ matchId: id, kind: 'start_match', dueAt: Date.now() });
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await engine.abort(id, 'test cleanup', 'system').catch(() => undefined);
  await stopHarness(h);
}, SUITE_TIMEOUT_MS);

// One draw and its window close, as the scheduler runs them.
async function draw(): Promise<void> {
  await engine.handle({ matchId: id, kind: 'draw', dueAt: Date.now() });
  const drawIndex = ((await engine.runner.current(id)).state.currentRound?.draws.length ?? 0) - 1;
  await engine.handle({ matchId: id, kind: 'close_speed_window', dueAt: Date.now(), drawIndex });
}

// The player's cells holding a drawn number that are still open.
async function openDrawnCells(accountId: string): Promise<number[]> {
  const round = (await engine.runner.current(id)).state.currentRound;
  const card = round?.cards[accountId]?.[0];
  if (round === null || card === undefined) return [];
  return card.card.cells.flatMap((c, i) =>
    c.kind !== 'free' && round.draws.includes(c.value) && card.marks[i] !== true ? [i] : [],
  );
}

// Draws until the player has an open drawn cell; those cells.
async function drawUntilOpen(accountId: string): Promise<number[]> {
  let cells: number[] = [];
  for (let i = 0; i < 40 && cells.length === 0; i += 1) {
    await draw();
    cells = await openDrawnCells(accountId);
  }
  return cells;
}

// The match's rows in one of its tables.
async function count(table: string): Promise<number> {
  const r = await h.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM sbr.${table} WHERE match_id = $1`,
    [id],
  );
  return Number(r.rows[0]?.n);
}

describe('a batch of taps on PostgreSQL (12 §5)', () => {
  it('is stored in one round trip', async () => {
    const [me] = players;
    const cells = await drawUntilOpen(me?.accountId ?? '');
    // Every statement any pooled client sends to the server.
    const sent = vi.spyOn(pg.Client.prototype, 'query');
    try {
      expect(await engine.mark(id, me?.accountId ?? '', 0, cells[0] ?? -1)).toBe(true);
      expect(sent.mock.calls.length).toBe(1);
    } finally {
      sent.mockRestore();
    }
  });

  it('refuses a stale tap batch and writes nothing', async () => {
    const [, me] = players;
    const cells = await drawUntilOpen(me?.accountId ?? '');
    const loaded = await h.built.match.store.load(id);
    if (loaded === null) throw new Error('match missing');
    const before = [await count('match_events'), await count('marks')];
    const cell = cells[0] ?? -1;
    const tap = {
      type: 'cellMarked' as const,
      accountId: me?.accountId ?? '',
      cardIndex: 0,
      cellIndex: cell,
      markPoints: 10,
    };
    await expect(
      h.built.match.store.append({
        matchId: id,
        expectedSeq: loaded.seq - 1,
        events: [tap],
        stateAfter: loaded.state,
        at: Date.now(),
        actorAccountId: me?.accountId ?? null,
        mark: { source: 'manual', speedBonuses: new Map([[markKey(tap.accountId, 0, cell), 0]]) },
      }),
    ).rejects.toBeInstanceOf(VersionConflict);
    expect([await count('match_events'), await count('marks')]).toEqual(before);
  });

  it('loses, doubles and reorders no tap while draws and batches race', async () => {
    const earlier = (await manualRows()).length;
    const answers = await raceRounds(20);
    expect(answers.filter((a) => a.ok).length).toBeGreaterThan(10);
    const log = await h.built.match.store.events(id, 0);
    expect(log.map((e) => e.seq)).toEqual(log.map((_e, i) => i + 1));
    const marked = log.flatMap((e) => (e.event.type === 'cellMarked' ? [e.event] : []));
    const rows = await manualRows();
    expectEachStoredOnce(answers, marked, rows);
    // Exactly the accepted taps were added, none twice.
    const accepted = new Set(
      answers.filter((a) => a.ok).map((a) => `${a.accountId}:${String(a.cell)}`),
    );
    const manual = rows.map((r) => `${r.player_id}:${String(r.cell)}`);
    expect(new Set(manual).size).toBe(manual.length);
    expect(manual.length - earlier).toBe(accepted.size);
  }, 120_000);
});

type Answer = { accountId: string; cell: number; ok: boolean };
type Row = { player_id: string; cell: number; speed_bonus: number };

// Every accepted tap is one event and one manual row whose speed bonus the event scored.
function expectEachStoredOnce(
  answers: readonly Answer[],
  marked: readonly { accountId: string; cellIndex: number; markPoints: number }[],
  rows: readonly Row[],
): void {
  for (const a of answers.filter((x) => x.ok)) {
    const events = marked.filter((e) => e.accountId === a.accountId && e.cellIndex === a.cell);
    const stored = rows.filter((r) => r.player_id === a.accountId && r.cell === a.cell);
    expect(events).toHaveLength(1);
    expect(stored).toHaveLength(1);
    // Classic marks score base 10 plus the tap's speed bonus.
    expect(stored[0]?.speed_bonus).toBe((events[0]?.markPoints ?? 0) - 10);
  }
}

// The match's manual mark rows.
async function manualRows() {
  const r = await h.pool.query<Row>(
    `SELECT player_id, cell, speed_bonus FROM sbr.marks WHERE match_id = $1 AND source = 'manual'`,
    [id],
  );
  return r.rows;
}

// Rounds of the players tapping every open drawn number of theirs while the next draw is under
// way; each tap's answer.
async function raceRounds(rounds: number) {
  const answers: Answer[] = [];
  for (let i = 0; i < rounds; i += 1) {
    const taps = await Promise.all(
      players.map(async (p) => ({ p, cells: await openDrawnCells(p.accountId) })),
    );
    await Promise.all([
      draw(),
      ...taps.flatMap(({ p, cells }) =>
        cells.map(async (cell) => {
          const ok = await engine.mark(id, p.accountId, 0, cell);
          answers.push({ accountId: p.accountId, cell, ok });
        }),
      ),
    ]);
  }
  return answers;
}
