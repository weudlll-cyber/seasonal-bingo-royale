/**
 * @file   apps/server/test/asyncMatch.integration.test.ts
 * @module server/test
 * @brief  Asynchronous matches over HTTP: create, time travel, "While you were away" (WP-14).
 *
 * Responsibility: POST /matches creates an asynchronous royale (mode, interval, quiet hours, time
 *                 zone in the summary); an unknown time zone is refused, an asynchronous classic
 *                 match too. A player joins, the match starts with bots, the development time
 *                 travel moves it a day ahead (its draws run through the scheduler rows); the
 *                 player's away summary counts the draws in the log and the player's marks and
 *                 is acknowledged (the next fetch has nothing, last_seen_event_seq is the current
 *                 seq). A stranger gets no summary; a guest 401. The match is aborted at the end.
 * Depends on:     ./harness, ./session
 * Spec:           docs/spec/01-game-design.md §5, §11; docs/spec/05-api-design.md §2.3;
 *                 docs/spec/06-realtime-architecture.md §6; docs/spec/12-testing-strategy.md §4
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { signIn, type Client } from './session.js';

const DAY = 86_400_000;
let harness: Harness;
let host: Client;
let player: Client;

beforeAll(async () => {
  harness = await startHarness();
  host = await signIn(harness.built.fastify, 'host');
  player = await signIn(harness.built.fastify, 'player-1');
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

const asyncMatch = {
  title: 'Slow royale',
  gameType: 'royale',
  mode: 'async',
  drawMode: 'auto',
  missedNumbers: { kind: 'noAutoMark' },
  maxPlayers: 8,
  quietHours: { startHour: 1, endHour: 3 },
  timeZone: 'Europe/Berlin',
};

interface Summary {
  readonly draws: number;
  readonly marks: number;
  readonly toSeq: number;
  readonly cutsSurvived: number;
  readonly eliminated: boolean;
}

describe('creating an asynchronous match', () => {
  it('stores the mode, interval, quiet hours and time zone', async () => {
    const created = await host.post('/api/v1/matches', asyncMatch);
    expect(created.statusCode).toBe(201);
    const { code } = created.json<{ code: string }>();
    const summary = (await host.get(`/api/v1/matches/${code}`)).json<{
      mode: string;
      settings: {
        drawIntervalMs: number;
        markingMode: string;
        quietHours: unknown;
        timeZone: string;
      };
    }>();
    expect(summary.mode).toBe('async');
    expect(summary.settings).toMatchObject({
      drawIntervalMs: 15 * 60_000,
      markingMode: 'auto',
      quietHours: { startHour: 1, endHour: 3 },
      timeZone: 'Europe/Berlin',
    });
  });

  it('refuses an unknown time zone and an asynchronous classic match', async () => {
    const zone = await host.post('/api/v1/matches', { ...asyncMatch, timeZone: 'Mars/Olympus' });
    expect(zone.statusCode).toBe(400);
    const classic = await host.post('/api/v1/matches', {
      ...asyncMatch,
      gameType: 'classic',
      prizes: ['rows-1'],
    });
    expect(classic.statusCode).toBe(422);
    expect(classic.json<{ code: string }>().code).toBe('ASYNC_ROYALE_ONLY');
  });
});

describe('a day away (journey 2)', () => {
  it('summarises the draws and marks since the player last looked, once', async () => {
    const created = await host.post('/api/v1/matches', { ...asyncMatch, quietHours: null });
    const { code, id } = created.json<{ code: string; id: string }>();
    expect((await player.post(`/api/v1/matches/${code}/join`, {})).statusCode).toBe(204);
    const engine = harness.built.match.engine;
    await engine.fillWithBots(id, 8);
    await engine.start(id, 0);
    // Nothing happened yet since the join but the start: no summary.
    const early = await player.get(`/api/v1/matches/${code}/away-summary`);
    expect(early.json<{ summary: Summary | null }>().summary).toBeNull();
    const travel = await host.post('/api/v1/dev/time-travel', { code, ms: DAY });
    expect(travel.statusCode).toBe(200);
    expect(travel.json<{ actions: number }>().actions).toBeGreaterThan(90);
    const log = await harness.built.match.store.events(id, 0);
    const draws = log.filter((e) => e.event.type === 'drawMade').length;
    // 15-minute draws, the pause between rounds aside: about 96 in a day.
    expect(draws).toBeGreaterThan(90);
    const away = await player.get(`/api/v1/matches/${code}/away-summary`);
    const summary = away.json<{ summary: Summary | null }>().summary;
    expect(summary?.draws).toBe(draws);
    expect(summary?.marks).toBeGreaterThan(0);
    expect(summary?.toSeq).toBe(log.length);
    const seen = await harness.pool.query<{ seq: string }>(
      `SELECT last_seen_event_seq AS seq FROM sbr.match_entries
        WHERE match_id = $1 AND account_id IS NOT NULL`,
      [id],
    );
    expect(Number(seen.rows[0]?.seq)).toBe(log.length);
    const again = await player.get(`/api/v1/matches/${code}/away-summary`);
    expect(again.json<{ summary: Summary | null }>().summary).toBeNull();
    // The host plays not: no summary. A guest has to sign in.
    const theirs = await host.get(`/api/v1/matches/${code}/away-summary`);
    expect(theirs.json<{ summary: Summary | null }>().summary).toBeNull();
    const guest = await harness.built.fastify.inject({
      method: 'GET',
      url: `/api/v1/matches/${code}/away-summary`,
    });
    expect(guest.statusCode).toBe(401);
  }, 120_000);
});
