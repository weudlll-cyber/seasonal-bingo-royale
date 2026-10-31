/**
 * @file   apps/server/test/matchRules.integration.test.ts
 * @module server/test
 * @brief  Match rules over HTTP and the socket: who hosts, the pause between rounds, the fast profile.
 *
 * Responsibility: against a listening server: only the host is told they host a match and
 *                 a player can neither draw nor start it (POLISH-1); the royale pause choice
 *                 is stored, only the host may start the next round and only while the match
 *                 waits (D14); the development fast profile gives royale its short ruleset and
 *                 keeps the classic default; an overlong prize key is refused with 400, and
 *                 the database refuses one written past the API. The matches it opens are
 *                 aborted at the end.
 * Depends on:     vitest, ./harness, ./socketKit
 * Spec:           docs/spec/01-game-design.md §7.1; docs/spec/05-api-design.md §2.3; docs/spec/12-testing-strategy.md §4
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { stopOpenMatches, SUITE_TIMEOUT_MS } from './harness.js';
import { startSocketKit, type SocketKit } from './socketKit.js';

let kit: SocketKit;

beforeAll(async () => {
  kit = await startSocketKit();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  // Matches this suite opened stay in the database as aborted.
  await stopOpenMatches(kit.harness);
  await kit.close();
}, SUITE_TIMEOUT_MS);

describe('who hosts a match (POLISH-1)', () => {
  it('tells the host, and only the host, that they host the match; a player cannot draw', async () => {
    const code = await kit.createMatch('host');
    const asHost = (await kit.host.get(`/api/v1/matches/${code}`)).json<{ youHost: boolean }>();
    const asPlayer = (await kit.player.get(`/api/v1/matches/${code}`)).json<{ youHost: boolean }>();
    expect(asHost.youHost).toBe(true);
    expect(asPlayer.youHost).toBe(false);
    const listed = (await kit.host.get('/api/v1/matches')).json<{
      matches: { code: string; youHost: boolean }[];
    }>();
    expect(listed.matches.find((m) => m.code === code)?.youHost).toBe(true);
    const s = kit.open(kit.player.cookie);
    await kit.connected(s);
    expect(await kit.send(s, 'draw.next', { code })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect((await kit.player.post(`/api/v1/matches/${code}/start`, {})).statusCode).toBe(403);
  });
});

describe('pause between royale rounds (D14)', () => {
  it('stores the host choice; only the host may start the next round, and only when it waits', async () => {
    const r = await kit.host.post('/api/v1/matches', {
      title: 'pause',
      gameType: 'royale',
      drawMode: 'host',
      missedNumbers: { kind: 'noAutoMark' },
      maxPlayers: 10,
      roundPause: { kind: 'host' },
    });
    const { code } = r.json<{ code: string }>();
    const id = (await kit.host.get(`/api/v1/matches/${code}`)).json<{ id: string }>().id;
    // Read back from PostgreSQL (store.load), not from the engine's cache.
    const loaded = await kit.harness.built.match.store.load(id);
    expect(loaded?.record.settings.roundPause).toEqual({ kind: 'host' });
    const summary = (await kit.host.get(`/api/v1/matches/${code}`)).json<{
      waitingForHost: boolean;
    }>();
    expect(summary.waitingForHost).toBe(false);
    const playerSocket = kit.open(kit.player.cookie);
    await kit.connected(playerSocket);
    expect(await kit.send(playerSocket, 'round.next', { code })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
    const hostSocket = kit.open(kit.host.cookie);
    await kit.connected(hostSocket);
    expect(await kit.send(hostSocket, 'round.next', { code })).toEqual({
      ok: false,
      code: 'NOT_WAITING_FOR_HOST',
    });
  });
});

describe('prize text is capped (05 §2.3)', () => {
  it('refuses an overlong prize key over HTTP, and the database refuses one too', async () => {
    const r = await kit.host.post('/api/v1/matches', {
      title: 'prizes',
      gameType: 'classic',
      prizes: ['fullCard', 'x'.repeat(10_000)],
      drawMode: 'host',
      missedNumbers: { kind: 'noAutoMark' },
      maxPlayers: 8,
    });
    expect([r.statusCode, r.json<{ code: string }>().code]).toEqual([400, 'VALIDATION_FAILED']);
    const code = await kit.createMatch('host');
    const stored = kit.harness.pool.query(
      'UPDATE sbr.matches SET prizes = ARRAY[$2::text] WHERE code = $1',
      [code, 'x'.repeat(33)],
    );
    await expect(stored).rejects.toThrow(/matches_prizes_capped/);
  });
});

describe('fast test profile (development only)', () => {
  it('gives royale the short test ruleset and keeps the classic default', async () => {
    const created = async (gameType: string) => {
      const r = await kit.host.post('/api/v1/matches', {
        title: 'fast',
        gameType,
        ...(gameType === 'royale' ? {} : { prizes: ['fullCard'] }),
        drawMode: 'host',
        missedNumbers: { kind: 'noAutoMark' },
        maxPlayers: 8,
        testProfile: 'fast',
      });
      const { id } = r.json<{ id: string }>();
      return (await kit.harness.built.match.store.load(id))?.record;
    };
    const royale = await created('royale');
    expect(royale?.rulesetName).toBe('royale-realtime-fast-test');
    expect(royale?.ruleset.stages?.map((s) => s.rounds)).toEqual([1, 1, 1]);
    expect((await created('classic'))?.rulesetName).toBe('classic-realtime');
  });
});
