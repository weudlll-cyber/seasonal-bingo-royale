/**
 * @file   apps/server/test/openRounds.integration.test.ts
 * @module server/test
 * @brief  The public open-rounds answer (docs/OPEN-ROUNDS.md, D50): only open, marked, real rounds.
 *
 * Responsibility: a server in website mode under /games/bingo/ and one in local mode on the
 *                 same database. A match with "Show on the website" off is not listed; on and
 *                 open it is, with its fields and the join URL on the endpoint's own origin; the
 *                 host can switch it while the sign-up is open; a started match, a test match
 *                 (fast profile) and one with bots are not listed; no player name appears; the
 *                 answer is valid against the contract (@sbr/contracts openRoundsAnswer); no
 *                 login, cached 30 s, rate-limited per address. In local mode the option does
 *                 not exist (a ticked box is ignored, the host route is 404) and the list is
 *                 empty. Every match it creates ends aborted; accounts are removed.
 * Depends on:     vitest, @sbr/contracts, ../src/auth/accounts, ../src/index (types), ./harness, ./websiteHelpers
 * Spec:           docs/OPEN-ROUNDS.md; docs/spec/07-integration-architecture.md §7
 */
import { openRoundsAnswer } from '@sbr/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount } from '../src/auth/accounts.js';
import type { App } from '../src/index.js';
import { buildOn, startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { BASE, cookieOf, sessionOf, signInAs, WEBSITE } from './websiteHelpers.js';

let harness: Harness;
let local: App;
const created: string[] = [];

beforeAll(async () => {
  harness = await startHarness(WEBSITE);
  local = await buildOn(harness.pool, harness.container.getConnectionUri(), { SBR_DEV: '1' });
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  for (const id of created) {
    await harness.built.match.engine.abort(id, 'test cleanup', 'system').catch(() => undefined);
  }
  const made = await harness.pool.query<{ account_id: string }>(
    `SELECT account_id FROM sbr.external_identities WHERE subject LIKE 'or-%'`,
  );
  for (const row of made.rows) await deleteAccount(harness.pool, row.account_id);
  await local.fastify.close();
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

const website = () => harness.built;

// A host the website lets start games, with the CSRF token for its writes.
async function host() {
  const cookie = cookieOf(
    await signInAs(website(), { id: 'or-1', name: 'Hosting', canHost: 'true' }),
  );
  const csrf = (await sessionOf(website(), cookie)).csrfToken ?? '';
  return { cookie: cookie ?? '', 'x-csrf-token': csrf };
}

async function create(
  headers: Record<string, string>,
  extra: object,
  app = website(),
  base = BASE,
) {
  const r = await app.fastify.inject({
    method: 'POST',
    url: `${base}api/v1/matches`,
    headers,
    payload: {
      title: 'Friday royale',
      gameType: 'royale',
      drawMode: 'host',
      missedNumbers: { kind: 'noAutoMark' },
      maxPlayers: 40,
      ...extra,
    },
  });
  expect(r.statusCode).toBe(201);
  const m = r.json<{ id: string; code: string }>();
  created.push(m.id);
  return m;
}

const listed = async (app = website(), base = BASE) => {
  const r = await app.fastify.inject({ url: `${base}api/public/open-rounds` });
  expect(r.statusCode).toBe(200);
  return r;
};

describe('the open rounds on the website (D50)', () => {
  it('lists only a marked, open, real round, with the contract fields and no names', async () => {
    const h = await host();
    const off = await create(h, {});
    const on = await create(h, { showOnWebsite: true });
    // A test match (the fast test profile of development builds) carries the test ruleset.
    const test = await create(h, { showOnWebsite: true });
    await harness.pool.query(
      `UPDATE sbr.matches SET ruleset_name = 'royale-realtime-fast-test' WHERE id = $1`,
      [test.id],
    );
    const bots = await create(h, { showOnWebsite: true });
    await website().match.engine.fillWithBots(bots.id, 2);
    const r = await listed();
    expect(r.headers['cache-control']).toBe('public, max-age=30');
    const answer = openRoundsAnswer.parse(r.json());
    const ids = answer.rounds.map((x) => x.id);
    expect(ids).toContain(on.id);
    expect(ids).not.toContain(off.id);
    expect(ids).not.toContain(test.id);
    expect(ids).not.toContain(bots.id);
    expect(answer.rounds.find((x) => x.id === on.id)).toEqual({
      id: on.id,
      title: 'Friday royale',
      kind: 'Seasonal Bingo Royale',
      startsAt: null,
      signupClosesAt: null,
      players: 0,
      maxPlayers: 40,
      joinUrl: `https://example.org${BASE}#/match/${on.code}`,
    });
    expect(r.body).not.toContain('Hosting');
  });
});

describe('the open rounds as the host changes them, and elsewhere (D50)', () => {
  it('follows the host switching it, and drops a started round', async () => {
    const h = await host();
    const m = await create(h, {});
    const flip = (show: boolean) =>
      website().fastify.inject({
        method: 'POST',
        url: `${BASE}api/v1/matches/${m.code}/website`,
        headers: h,
        payload: { show },
      });
    expect((await flip(true)).statusCode).toBe(200);
    expect(openRoundsAnswer.parse((await listed()).json()).rounds.map((x) => x.id)).toContain(m.id);
    // Eight website members join (no bots: a match with bots is never listed anyway).
    for (let i = 1; i <= 8; i += 1) {
      const c = cookieOf(
        await signInAs(website(), { id: `or-p${String(i)}`, name: `Player${String(i)}` }),
      );
      const id = (await sessionOf(website(), c)).account?.id ?? '';
      await website().match.engine.join(m.id, id, true);
    }
    await website().match.engine.start(m.id, 0);
    expect(openRoundsAnswer.parse((await listed()).json()).rounds.map((x) => x.id)).not.toContain(
      m.id,
    );
    expect((await flip(false)).statusCode).toBe(409);
  });
  it('has no website option and an empty list in a standalone install', async () => {
    const sign = await local.fastify.inject({
      method: 'POST',
      url: '/api/v1/dev/sign-in',
      payload: { as: 'host' },
    });
    const cookie = cookieOf(sign) ?? '';
    const csrf = (await sessionOf(local, cookie, {}, '/')).csrfToken ?? '';
    const m = await create({ cookie, 'x-csrf-token': csrf }, { showOnWebsite: true }, local, '/');
    const r = await listed(local, '/');
    expect(openRoundsAnswer.parse(r.json()).rounds.map((x) => x.id)).not.toContain(m.id);
    const flip = await local.fastify.inject({
      method: 'POST',
      url: `/api/v1/matches/${m.code}/website`,
      headers: { cookie, 'x-csrf-token': csrf },
      payload: { show: true },
    });
    expect(flip.statusCode).toBe(404);
  });

  it('is rate-limited per address', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 70; i += 1) {
      const r = await website().fastify.inject({
        url: `${BASE}api/public/open-rounds`,
        remoteAddress: '10.9.9.9',
      });
      codes.push(r.statusCode);
    }
    expect(codes).toContain(429);
  });
});
