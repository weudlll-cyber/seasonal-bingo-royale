/**
 * @file   apps/server/test/accountFeed.integration.test.ts
 * @module server/test
 * @brief  The website's account-changes feed: sessions end, deleted accounts go, the cursor stays.
 *
 * Responsibility: a server in website mode (./websiteHelpers) polling a stub of the website's
 *                 feed (X-Games-Sync-Token checked, pages by `since`). Every kind (locked,
 *                 unlocked, rights, an unknown one) revokes all sessions of the linked account
 *                 at once and closes its open sockets; a locked player whom the website then
 *                 answers as a guest gets no session again; "deleted" deletes the game account
 *                 (off the leaderboard, its match entry keeps the points under a "deleted
 *                 player" name) and refuses a later sign-in with the same website id; ids not
 *                 linked to an account are skipped. The poll follows `next` until a page is
 *                 empty, keeps the cursor in the database (a restarted server goes on from it),
 *                 and survives a 401 (status file written, cursor unchanged, play goes on). The
 *                 match it creates ends aborted; the accounts it creates are deleted.
 * Depends on:     vitest, node:http, node:fs, node:os, node:path, socket.io-client,
 *                 ../src/index (types), ./harness, ./websiteHelpers
 * Spec:           docs/spec/07-integration-architecture.md §2.4
 */
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { App } from '../src/index.js';
import { buildOn, startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { BASE, cookieOf, SECRET, sessionOf, signInAs, WEBSITE } from './websiteHelpers.js';

const TOKEN = 'ab'.repeat(32);

// The stub feed: one answer per `since`, the requests it got, and an override status.
interface Page {
  readonly changes: readonly { readonly id: number; readonly kind: string }[];
  readonly next: string;
}
const pages = new Map<string, Page>();
const asked: { since: string; token: string | undefined }[] = [];
let status = 200;
const stub = http.createServer((request, response) => {
  const since = new URL(request.url ?? '/', 'http://stub').searchParams.get('since') ?? '0';
  const token = request.headers['x-games-sync-token'];
  asked.push({ since, token: Array.isArray(token) ? token[0] : token });
  if (status !== 200 || token !== TOKEN) {
    response.writeHead(status === 200 ? 401 : status).end('{}');
    return;
  }
  const page = pages.get(since) ?? { changes: [], next: since };
  response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(page));
});

let harness: Harness;
const dataDir = mkdtempSync(path.join(tmpdir(), 'sbr-feed-'));
let settings: Record<string, string> = {};
let matchId = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
  const { port } = stub.address() as AddressInfo;
  settings = {
    ...WEBSITE,
    SBR_DATA_DIR: dataDir,
    SBR_WEBSITE_FEED_URL: `http://127.0.0.1:${String(port)}/api/games/bingo/account-changes`,
    SBR_WEBSITE_SYNC_TOKEN: TOKEN,
  };
  harness = await startHarness(settings);
  await harness.built.fastify.listen({ host: '127.0.0.1', port: 0 });
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  if (matchId !== '') {
    await harness.built.match.engine
      .abort(matchId, 'test cleanup', 'system')
      .catch(() => undefined);
  }
  await harness.pool.query(
    `DELETE FROM sbr.accounts WHERE id IN (SELECT e.account_id FROM sbr.external_identities e
      WHERE e.subject LIKE 'f%' OR e.subject ~ '^[0-9]+$')`,
  );
  await stopHarness(harness);
  await new Promise((resolve) => stub.close(resolve));
}, SUITE_TIMEOUT_MS);

const app = (): App => harness.built;
const feed = () => {
  const f = app().feed;
  if (f === null) throw new Error('no feed in website mode');
  return f;
};

// Signs website user `id` (a number, as the website's ids are) in; the cookie and account id.
async function member(id: number, name: string) {
  const cookie = cookieOf(await signInAs(app(), { id: String(id), name }));
  const accountId = (await sessionOf(app(), cookie)).account?.id ?? '';
  return { cookie, accountId };
}

// A live game socket of that session.
async function socketOf(cookie: string | null): Promise<Socket> {
  const { port } = app().fastify.server.address() as AddressInfo;
  const socket = io(`http://127.0.0.1:${String(port)}/play`, {
    path: `${BASE}ws`,
    transports: ['websocket'],
    extraHeaders: { cookie: cookie ?? '', origin: 'https://example.org' },
  });
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => {
      resolve();
    });
    socket.on('connect_error', reject);
  });
  return socket;
}

const closed = (socket: Socket) =>
  new Promise<boolean>((resolve) => {
    if (socket.disconnected) resolve(true);
    socket.on('disconnect', () => {
      resolve(true);
    });
    setTimeout(() => {
      resolve(socket.disconnected);
    }, 3_000);
  });

const cursor = async () =>
  (await harness.pool.query<{ cursor: string }>('SELECT cursor FROM sbr.website_feed')).rows[0]
    ?.cursor;

describe('the account-changes feed (07 §2.4)', () => {
  it('ends every session of a changed account and closes its sockets, whatever the kind', async () => {
    const people = await Promise.all([11, 12, 13, 14].map((id) => member(id, `Feed${String(id)}`)));
    const sockets = await Promise.all(people.map((p) => socketOf(p.cookie)));
    const bystander = await member(15, 'Feed15');
    pages.set('0', {
      changes: [
        { id: 11, kind: 'locked' },
        { id: 12, kind: 'unlocked' },
        { id: 13, kind: 'rights' },
        { id: 14, kind: 'renamed-or-new' },
        { id: 999, kind: 'locked' },
      ],
      next: '5',
    });
    await feed().poll();
    for (const p of people) expect((await sessionOf(app(), p.cookie)).signedIn).toBe(false);
    expect(await Promise.all(sockets.map(closed))).toEqual([true, true, true, true]);
    expect((await sessionOf(app(), bystander.cookie)).signedIn).toBe(true);
    expect(await cursor()).toBe('5');
    expect(asked.every((a) => a.token === TOKEN)).toBe(true);
  });

  it('keeps a locked player a guest: the website answers them as one', async () => {
    const r = await app().fastify.inject({
      method: 'GET',
      url: `${BASE}auth/website?next=${encodeURIComponent(BASE)}`,
      headers: { 'x-acting-guest': 'true', 'x-sbr-proxy-secret': SECRET },
      remoteAddress: '127.0.0.1',
    });
    expect(r.headers.location).toContain(`${BASE}auth/website/login`);
    expect(cookieOf(r)).toBeNull();
  });

  it('follows next until a page is empty, and a restarted server goes on from the cursor', async () => {
    pages.set('5', { changes: [{ id: 999, kind: 'rights' }], next: '7' });
    pages.set('7', { changes: [{ id: 998, kind: 'rights' }], next: '9' });
    asked.length = 0;
    await feed().poll();
    expect(asked.map((a) => a.since)).toEqual(['5', '7', '9']);
    expect(await cursor()).toBe('9');
    const again = await buildOn(harness.pool, harness.container.getConnectionUri(), settings);
    try {
      asked.length = 0;
      await again.feed?.poll();
      expect(asked.map((a) => a.since)).toEqual(['9']);
    } finally {
      await again.fastify.close();
    }
  });
});

describe('the feed when it fails, and deleted accounts (07 §2.4)', () => {
  it('survives a refused feed: the cursor stays, the status file says so, then clears', async () => {
    status = 401;
    await feed().poll();
    expect(await cursor()).toBe('9');
    const file = path.join(dataDir, 'website-feed');
    expect(readFileSync(file, 'utf8')).toContain('401');
    status = 200;
    await feed().poll();
    expect(existsSync(file)).toBe(false);
  });

  it('deletes a deleted account: off the board, points kept under a deleted name, never back', async () => {
    const gone = await member(21, 'Gone21');
    const engine = app().match.engine;
    const m = await engine.create(
      {
        title: 'Feed',
        gameType: 'classic',
        prizes: ['fullCard'],
        drawMode: 'host',
        missedNumbers: { kind: 'noAutoMark' },
        maxPlayers: 8,
      },
      null,
    );
    matchId = m.id;
    await engine.join(m.id, gone.accountId, true);
    await harness.pool.query('UPDATE sbr.match_entries SET score = 40 WHERE match_id = $1', [m.id]);
    pages.set('9', { changes: [{ id: 21, kind: 'deleted' }], next: '10' });
    await feed().poll();
    const left = await harness.pool.query<{ id: string }>(
      'SELECT id FROM sbr.accounts WHERE id = $1',
      [gone.accountId],
    );
    expect(left.rows).toEqual([]);
    const entry = await harness.pool.query<{ account_id: string | null; score: string }>(
      'SELECT account_id, score FROM sbr.match_entries WHERE match_id = $1',
      [m.id],
    );
    expect(entry.rows).toEqual([{ account_id: null, score: '40' }]);
    const view = await app().fastify.inject({ url: `${BASE}api/v1/matches/${m.code}/state` });
    expect(view.body).toMatch(/deleted player [0-9a-f]{4}/);
    expect(view.body).not.toContain('Gone21');
    const back = await signInAs(app(), { id: '21', name: 'Gone21' });
    expect(back.statusCode).toBe(403);
    expect(cookieOf(back)).toBeNull();
  });
});
