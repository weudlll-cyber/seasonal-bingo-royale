/**
 * @file   e2e/websiteStack.ts
 * @module e2e
 * @brief  A game server in website mode behind the kit's stand-in of the website (D37, kit K74).
 *
 * Responsibility: a database per worker (`sbr_e2e_website_w<n>`, kept, so no other scheduler runs
 *                 its matches); the kit's `startWebsiteStandIn` as the website and its proxy
 *                 (/login, /embed/chat, the identity on /games/bingo/auth/website only, cookie
 *                 `se.sid`); the server in website mode under /games/bingo/, trusting only the
 *                 proxy. `addMember`, `cookieOf` and `signInAs` (whom the website's login signs
 *                 in); `expireSessions` idles sessions out; `removeAccounts` deletes the members'
 *                 accounts (D42).
 * Depends on:     node:child_process, node:crypto, node:net, node:fs, node:os, @playwright/test,
 *                 @seasonal/kit/testing, ./devStack
 * Used by:        ./websiteLogin.spec, ./chatEmbed.spec, ./websiteIdle.spec, ./backToWebsite.spec,
 *                 ./acceptance/fitAudit.spec
 * Spec:           docs/spec/07-integration-architecture.md §2.3; docs/spec/12-testing-strategy.md §4
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { request } from '@playwright/test';
import {
  startWebsiteStandIn,
  type StandInMember,
  type WebsiteStandIn,
} from '@seasonal/kit/testing';

import { databaseUrl, REPO_ROOT } from './devStack.js';
import { FROM_THIS_SITE } from './fromThisSite.js';

const SERVER_DIR = path.join(REPO_ROOT, 'apps/server');
const WEB_DIR = path.join(REPO_ROOT, 'apps/web');
// One database per Playwright worker: specs in other workers run their own stack at the same
// time, and a server must never see (and schedule) another stack's matches.
const DB_NAME = `sbr_e2e_website_w${process.env['TEST_PARALLEL_INDEX'] ?? '0'}`;
const SIGN_IN = '/games/bingo/auth/website';
const SECRET = randomBytes(32).toString('hex');

// A member of the stand-in website.
export type Member = StandInMember;

export interface WebsiteStack {
  // The website's origin, e.g. http://127.0.0.1:51234, and the app's own (behind its proxy).
  readonly origin: string;
  readonly appOrigin: string;
  addMember(member: Member): void;
  memberName(id: number): string;
  // The website's session cookie of a member, for a browser context.
  cookieOf(id: number): { name: string; value: string; url: string };
  // Whom the website's login page signs in from now on (null: nobody).
  signInAs(id: number | null): void;
  removeAccounts(): Promise<void>;
  // Every open game session idles out now, as after 30 minutes (an admin's) without a request.
  expireSessions(): void;
  close(): Promise<void>;
}

// SQL through the server package's pg (the e2e package has none), outside any request.
function sql(url: string, statement: string): void {
  const code = `import pg from 'pg'; const c = new pg.Client(${JSON.stringify(url)});
    await c.connect(); try { await c.query(${JSON.stringify(statement)}); }
    catch (e) { if (e.code !== '42P04') throw e; } finally { await c.end(); }`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: SERVER_DIR,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`sql failed: ${r.stderr}`);
}

function ownDatabase(): string {
  const admin = databaseUrl();
  // 42P04 (it exists already) is fine: the database is kept between runs.
  sql(admin, `CREATE DATABASE ${DB_NAME}`);
  const url = new URL(admin);
  url.pathname = `/${DB_NAME}`;
  return url.toString();
}

function buildClient(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbr-website-client-'));
  const vite = path.join(WEB_DIR, 'node_modules/vite/bin/vite.js');
  const r = spawnSync(
    process.execPath,
    [vite, 'build', '--outDir', dir, '--emptyOutDir', '--logLevel', 'error'],
    {
      cwd: WEB_DIR,
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
    },
  );
  if (r.status !== 0) throw new Error(`client build failed: ${r.stderr}`);
  return dir;
}

// A port nothing listens on now: the stand-in is told the app's address before the app starts.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => {
        resolve(port);
      });
    });
  });
}

// The server in website mode; resolves once it listens.
function startServer(env: Record<string, string>): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['--import=tsx', 'src/main.ts'], {
    cwd: SERVER_DIR,
    env: { ...process.env, ...env },
  });
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => {
      reject(new Error(`the server did not start:\n${out}`));
    }, 90_000);
    const read = (chunk: Buffer): void => {
      out += chunk.toString();
      if (!/listening at http:\/\/127\.0\.0\.1:\d+/.test(out)) return;
      clearTimeout(timer);
      resolve(child);
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('exit', (code) => {
      reject(new Error(`the server stopped (${String(code)}):\n${out}`));
    });
  });
}

// Each member signs in once more (one who never played gets an account here) and deletes the
// game account by typing its name (D42).
async function removeAccounts(origin: string, members: readonly Member[]): Promise<void> {
  for (const { id } of members) {
    // The website cookie on the sign-in request only: the game's session cookie it sets goes
    // into the context's jar for the calls after it (a fixed cookie header would hide it).
    const ctx = await request.newContext({ baseURL: origin });
    await ctx.get(`${SIGN_IN}?next=%2Fgames%2Fbingo%2F`, {
      maxRedirects: 0,
      headers: { cookie: `se.sid=${String(id)}` },
    });
    const session = (await (await ctx.get('/games/bingo/api/v1/session')).json()) as {
      account: { displayName: string } | null;
      csrfToken: string;
    };
    if (session.account === null) throw new Error(`${String(id)} is not signed in`);
    const r = await ctx.delete('/games/bingo/api/v1/me', {
      data: { displayName: session.account.displayName },
      headers: { ...FROM_THIS_SITE, 'x-csrf-token': session.csrfToken },
    });
    if (r.status() !== 204) {
      throw new Error(`account of ${String(id)} not deleted: ${String(r.status())}`);
    }
    await ctx.dispose();
  }
}

// What the stand-in gives the specs, with the members it reads at every request.
function membersOf(standIn: WebsiteStandIn, members: Member[]) {
  return {
    addMember: (member: Member): void => {
      members.push(member);
    },
    memberName: (id: number): string => members.find((m) => m.id === id)?.name ?? '',
    cookieOf: (id: number) => standIn.sessionCookie(id),
    signInAs: (id: number | null): void => {
      standIn.signInAs(id);
    },
  };
}

export async function startWebsiteStack(): Promise<WebsiteStack> {
  const db = ownDatabase();
  const webDir = buildClient();
  const members: Member[] = [];
  const port = await freePort();
  const appOrigin = `http://127.0.0.1:${String(port)}`;
  const standIn = await startWebsiteStandIn({
    games: { bingo: { app: appOrigin, secretHeader: 'x-sbr-proxy-secret', secret: SECRET } },
    members,
    // Longer than any spec's pause between two requests: an idle connection is not closed just
    // as a poll reuses it.
    keepAliveMs: 60_000,
  });
  const server = await startServer({
    DATABASE_URL: db,
    SBR_HOST: '127.0.0.1',
    SBR_PORT: String(port),
    SBR_DEV: '1',
    SBR_LOG_LEVEL: 'info',
    SBR_AUTH_MODE: 'website',
    SBR_BASE_PATH: '/games/bingo/',
    SBR_PUBLIC_URL: `${standIn.origin}/games/bingo/`,
    SBR_TRUSTED_PROXIES: '127.0.0.1',
    SBR_WEBSITE_PROXY_SECRET: SECRET,
    SBR_WEB_DIR: webDir,
    SBR_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'sbr-website-data-')),
  });
  return {
    origin: standIn.origin,
    appOrigin,
    ...membersOf(standIn, members),
    removeAccounts: () => removeAccounts(standIn.origin, members),
    expireSessions: () => {
      sql(db, "UPDATE sbr.sessions SET idle_expires_at = now() - interval '1 second'");
    },
    close: async () => {
      // The stand-in first: a page left open holds a socket the game's shutdown would wait for.
      await standIn.close();
      const exited = new Promise((resolve) => server.once('exit', resolve));
      server.kill();
      await exited;
    },
  };
}
