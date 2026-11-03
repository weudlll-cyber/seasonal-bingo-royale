/**
 * @file   apps/server/test/twoMatches.integration.test.ts
 * @module server/test
 * @brief  One player in two matches at once, each in its own tab (D39).
 *
 * Responsibility: player-1 joins an asynchronous royale and a realtime royale; both start. Two
 *                 sockets of the same session stand for two tabs, each watching one match. The
 *                 player taps the realtime match over its socket while a day of the asynchronous
 *                 match runs (development time travel, that match's clock only): its automatic
 *                 marking keeps going; the realtime match, its log, its standings and the
 *                 player's state there (points, seasons, shield) do not move; each socket hears
 *                 only its own match; the away summary counts only the asynchronous match's
 *                 draws. The matches are aborted at the end.
 * Depends on:     @sbr/domain (types), socket.io-client (types), ./harness, ./socketKit
 * Spec:           docs/spec/01-game-design.md §5, §11 (D39); docs/spec/06-realtime-architecture.md §4
 */
import type { MatchState } from '@sbr/domain';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SUITE_TIMEOUT_MS } from './harness.js';
import { startSocketKit, type SocketKit } from './socketKit.js';

const DAY = 86_400_000;
let kit: SocketKit;

beforeAll(async () => {
  kit = await startSocketKit();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await kit.close();
}, SUITE_TIMEOUT_MS);

const royale = {
  gameType: 'royale',
  missedNumbers: { kind: 'noAutoMark' },
  maxPlayers: 10,
};

// A royale player-1 joined, filled with bots and started; returns its code and id.
async function joinedRoyale(body: object): Promise<{ code: string; id: string }> {
  const created = await kit.host.post('/api/v1/matches', { ...royale, ...body });
  expect(created.statusCode).toBe(201);
  const match = created.json<{ code: string; id: string }>();
  expect((await kit.player.post(`/api/v1/matches/${match.code}/join`, {})).statusCode).toBe(204);
  const engine = kit.harness.built.match.engine;
  await engine.fillWithBots(match.id, 8);
  await engine.start(match.id, 0);
  return match;
}

// A tab: a socket of player-1's session watching one match, with the frames it hears.
async function tab(code: string): Promise<{ socket: Socket; seqs: number[] }> {
  const socket = kit.open(kit.player.cookie);
  expect(await kit.connected(socket)).toBe('ok');
  const seqs: number[] = [];
  socket.on('events', (f: { events: { s: number }[] }) => seqs.push(...f.events.map((e) => e.s)));
  expect((await kit.send(socket, 'match.watch', { code })).ok).toBe(true);
  return { socket, seqs };
}

// player-1's cell holding the round's newest number, if it came after the first `seen` draws.
function newOwnCell(round: MatchState['currentRound'], seen: number): number {
  if (round === null || round.draws.length <= seen) return -1;
  const item = round.draws.at(-1);
  const me = Object.keys(round.cards).find((p) => !p.startsWith('bot-')) ?? '';
  const cells = round.cards[me]?.[0]?.card.cells ?? [];
  return cells.findIndex((c) => c.kind !== 'free' && c.value === item);
}

// The host draws the realtime match (closing each window) until a new number on player-1's
// card comes (an earlier one may be tapped already), then player-1 taps it in that match's
// tab. Returns whether the tap was accepted.
async function tapNextOwnNumber(socket: Socket, code: string, id: string): Promise<boolean> {
  const engine = kit.harness.built.match.engine;
  const seen = (await engine.runner.current(id)).state.currentRound?.draws.length ?? 0;
  for (let i = 0; i < 60; i += 1) {
    const round = (await engine.runner.current(id)).state.currentRound;
    const cell = newOwnCell(round, seen);
    if (cell >= 0) return (await kit.send(socket, 'mark', { code, cardIndex: 0, cell })).ok;
    const drawIndex = (round?.draws.length ?? 0) - 1;
    if (drawIndex >= 0) {
      await engine.handle({
        matchId: id,
        kind: 'close_speed_window',
        dueAt: Date.now(),
        drawIndex,
      });
    }
    await engine.handle({ matchId: id, kind: 'draw', dueAt: Date.now() });
  }
  return false;
}

// What the realtime match holds for player-1: log length, standings row, own state.
async function realtimeFacts(id: string) {
  const m = await kit.harness.built.match.engine.runner.current(id);
  const me = m.state.playerOrder.find((p) => !p.startsWith('bot-')) ?? '';
  const standing = await kit.harness.pool.query<{ score: string; seasons: number }>(
    'SELECT score, seasons FROM sbr.standings WHERE match_id = $1 AND player_id = $2',
    [id, me],
  );
  return { seq: m.seq, player: m.state.players[me], standing: standing.rows[0] };
}

describe('one player in an asynchronous and a realtime match at once (D39)', () => {
  it('keeps both matches, their sockets and the away summary apart', async () => {
    const slow = await joinedRoyale({
      title: 'Slow',
      mode: 'async',
      drawMode: 'auto',
      quietHours: null,
    });
    const live = await joinedRoyale({ title: 'Live', drawMode: 'host' });
    const engine = kit.harness.built.match.engine;
    await engine.handle({ matchId: live.id, kind: 'start_match', dueAt: Date.now() });
    try {
      const liveTab = await tab(live.code);
      const slowTab = await tab(slow.code);
      expect(await tapNextOwnNumber(liveTab.socket, live.code, live.id)).toBe(true);
      await expect.poll(() => liveTab.seqs.length).toBeGreaterThan(0);
      const before = await realtimeFacts(live.id);
      const heardLive = liveTab.seqs.length;
      // A day of the asynchronous match while the realtime one waits for its host.
      const travel = await kit.host.post('/api/v1/dev/time-travel', { code: slow.code, ms: DAY });
      expect(travel.statusCode).toBe(200);
      const slowLog = await kit.harness.built.match.store.events(slow.id, 0);
      const slowDraws = slowLog.filter((e) => e.event.type === 'drawMade').length;
      expect(slowDraws).toBeGreaterThan(50);
      // Its automatic marking went on for player-1 (no tap of theirs in that match).
      const slowMarks = await kit.harness.pool.query<{ source: string; n: string }>(
        `SELECT source, count(*) AS n FROM sbr.marks m JOIN sbr.match_entries e
           ON e.match_id = m.match_id AND e.player_id = m.player_id
          WHERE m.match_id = $1 AND e.account_id IS NOT NULL GROUP BY source`,
        [slow.id],
      );
      expect(slowMarks.rows.map((r) => r.source)).toEqual(['auto']);
      expect(Number(slowMarks.rows[0]?.n)).toBeGreaterThan(0);
      // The realtime match did not move: log, standings row, the player's state there.
      expect(await realtimeFacts(live.id)).toEqual(before);
      // Each tab heard only its own match.
      await expect.poll(() => slowTab.seqs.length).toBeGreaterThan(50);
      expect(Math.max(...slowTab.seqs)).toBeLessThanOrEqual(slowLog.length);
      expect(liveTab.seqs.length).toBe(heardLive);
      expect(Math.max(...liveTab.seqs)).toBeLessThanOrEqual(before.seq);
      // The away summary counts the asynchronous match's draws only.
      const away = await kit.player.get(`/api/v1/matches/${slow.code}/away-summary`);
      expect(away.json<{ summary: { draws: number } | null }>().summary?.draws).toBe(slowDraws);
      // The realtime match goes on: another tap is accepted there.
      expect(await tapNextOwnNumber(liveTab.socket, live.code, live.id)).toBe(true);
    } finally {
      await engine.abort(slow.id, 'test cleanup', 'host');
      await engine.abort(live.id, 'test cleanup', 'host');
    }
  }, 180_000);
});
