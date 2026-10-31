/**
 * @file   apps/server/test/matchEnd.integration.test.ts
 * @module server/test
 * @brief  A match ended without a result records who ended it: the host or the system (D17).
 *
 * Responsibility: the host's abort and a system abort (development route) both end the
 *                 match as aborted; host and player read the same `matchAborted` event with
 *                 the reason and `by` ('host' or 'system') from the state endpoint; a second
 *                 abort of an ended match changes nothing.
 * Depends on:     ./harness, ./session
 * Spec:           docs/spec/01-game-design.md §13; docs/spec/05-api-design.md §2.3
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { signIn, type Client } from './session.js';

let harness: Harness;
// Each test makes a dozen requests on a fresh database; under a full parallel run that can
// pass Vitest's 5 s default.
const TEST_TIMEOUT_MS = 30_000;

beforeAll(async () => {
  harness = await startHarness();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

interface StateBody {
  readonly match: { readonly status: string };
  readonly view: { readonly events: readonly { readonly type: string }[] };
}

// An open match the player joined.
async function openMatch(host: Client, player: Client): Promise<string> {
  const created = await host.post('/api/v1/matches', {
    title: 'Ends early',
    gameType: 'royale',
    drawMode: 'host',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 8,
  });
  const { code } = created.json<{ code: string }>();
  await player.post(`/api/v1/matches/${code}/join`, {});
  return code;
}

async function endOf(client: Client, code: string) {
  const body = (await client.get(`/api/v1/matches/${code}/state`)).json<StateBody>();
  return { status: body.match.status, last: body.view.events.at(-1) };
}

describe('a match ended without a result (D17)', () => {
  it(
    'records the host as the one who ended it, for host and player alike',
    async () => {
      const host = await signIn(harness.built.fastify, 'host');
      const player = await signIn(harness.built.fastify, 'player-1');
      const code = await openMatch(host, player);
      const r = await host.post(`/api/v1/matches/${code}/abort`, {
        reason: 'Power cut in the hall',
      });
      expect(r.statusCode).toBe(200);
      const ended = { type: 'matchAborted', reason: 'Power cut in the hall', by: 'host' };
      expect(await endOf(host, code)).toEqual({ status: 'aborted', last: ended });
      expect(await endOf(player, code)).toEqual({ status: 'aborted', last: ended });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'records the system as the one who ended it, and a second abort changes nothing',
    async () => {
      const host = await signIn(harness.built.fastify, 'host');
      const player = await signIn(harness.built.fastify, 'player-2');
      const code = await openMatch(host, player);
      await host.post(`/api/v1/matches/${code}/dev-system-abort`, { reason: 'Server maintenance' });
      await host.post(`/api/v1/matches/${code}/abort`, { reason: 'Too late' });
      const ended = { type: 'matchAborted', reason: 'Server maintenance', by: 'system' };
      expect(await endOf(player, code)).toEqual({ status: 'aborted', last: ended });
    },
    TEST_TIMEOUT_MS,
  );
});
