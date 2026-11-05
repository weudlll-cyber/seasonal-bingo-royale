/**
 * @file   e2e/websiteStack.ts
 * @module e2e
 * @brief  A game server in website mode behind a stand-in of the website's proxy (D37).
 *
 * Responsibility: a database of its own (`sbr_e2e_website` beside the e2e database, made once
 *                 and kept, so no other server's scheduler runs its matches); the player client
 *                 built for production; a stand-in proxy on an ephemeral port that plays the
 *                 website: GET /login is its login page (a known stub user goes on to `next`);
 *                 /games/bingo/auth/website asks the stub users (cookie "stub_user=<id>", as the
 *                 website's authorize endpoint would) and passes the four X-Acting-User* headers
 *                 (and Can-Host) with the proxy secret, or sends a visitor without one to the app's
 *                 /games/bingo/auth/website/login with the same query (D43); every request
 *                 (WebSocket upgrades too) reaches the app with client-sent X-Acting-User* and
 *                 X-Sbr-Proxy-Secret headers removed. The server (development features on, for
 *                 the fast test rules) runs in website mode under /games/bingo/ on an ephemeral
 *                 port and trusts only the proxy's address. `removeAccounts` deletes the website
 *                 users' accounts at the end through DELETE /me with the display name (D42);
 *                 matches are never deleted.
 * Depends on:     node:child_process, node:crypto, node:http, node:net, node:fs, node:os,
 *                 @playwright/test, ./devStack
 * Used by:        ./websiteLogin.spec
 * Spec:           docs/spec/07-integration-architecture.md §2.3; docs/spec/12-testing-strategy.md §4
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import http, { type IncomingMessage } from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { request } from '@playwright/test';

import { databaseUrl, REPO_ROOT } from './devStack.js';

const SERVER_DIR = path.join(REPO_ROOT, 'apps/server');
const WEB_DIR = path.join(REPO_ROOT, 'apps/web');
const DB_NAME = 'sbr_e2e_website';
const SIGN_IN = '/games/bingo/auth/website';
const IDENTITY = /^(x-acting-user|x-acting-guest|x-sbr-proxy-secret)/i;
const SECRET = randomBytes(32).toString('hex');

export interface StubUser {
  readonly id: string;
  readonly name: string;
  readonly roles: string;
  readonly verified: boolean;
  // The website lets this member start games (X-Acting-User-Can-Host, 2026-11-04).
  readonly canHost: boolean;
}

export interface WebsiteStack {
  // The proxy's origin, e.g. http://127.0.0.1:51234, and the app's own (behind it).
  readonly origin: string;
  readonly appOrigin: string;
  // The website's users by id (the stub authorize endpoint reads them).
  readonly users: Map<string, StubUser>;
  removeAccounts(): Promise<void>;
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

const stubCookie = (cookie: string | undefined): string =>
  /(?:^|;\s*)stub_user=([^;]+)/.exec(cookie ?? '')?.[1] ?? '';

// The request's headers without client-sent identity headers, plus `extra`.
function forwarded(req: IncomingMessage, extra: Record<string, string>): http.OutgoingHttpHeaders {
  const headers: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) if (!IDENTITY.test(k)) headers[k] = v;
  headers['x-forwarded-for'] = req.socket.remoteAddress ?? '';
  return { ...headers, ...extra };
}

function identity(user: StubUser): Record<string, string> {
  return {
    'x-acting-user-id': user.id,
    'x-acting-user': user.name,
    'x-acting-user-roles': user.roles,
    'x-acting-user-email-verified': String(user.verified),
    'x-acting-user-can-host': String(user.canHost),
    'x-sbr-proxy-secret': SECRET,
  };
}

// The website's login page: a known user goes on to `next`, else the page.
function login(req: IncomingMessage, res: http.ServerResponse, users: Map<string, StubUser>) {
  const next = new URL(req.url ?? '/', 'http://stub').searchParams.get('next') ?? '/';
  if (!users.has(stubCookie(req.headers.cookie))) return void res.end('website login');
  res.writeHead(302, { location: next });
  res.end();
}

function startProxy(users: Map<string, StubUser>, app: { port: number }): http.Server {
  const server = http.createServer((req, res) => {
    const [pathname = '/', query] = (req.url ?? '/').split('?');
    if (pathname === '/login') {
      login(req, res, users);
      return;
    }
    let extra: Record<string, string> = {};
    if (pathname === SIGN_IN) {
      const user = users.get(stubCookie(req.headers.cookie));
      if (user === undefined) {
        res.writeHead(302, {
          location: `${SIGN_IN}/login${query === undefined ? '' : `?${query}`}`,
        });
        return void res.end();
      }
      extra = identity(user);
    }
    const options = { host: '127.0.0.1', port: app.port, method: req.method, path: req.url };
    const up = http.request({ ...options, headers: forwarded(req, extra) }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on('error', () => res.destroy());
    req.pipe(up);
  });
  server.on('upgrade', (req: IncomingMessage, socket: net.Socket, head: Buffer) => {
    const up = net.connect(app.port, '127.0.0.1', () => {
      const lines = Object.entries(forwarded(req, {})).map(([k, v]) => `${k}: ${String(v)}`);
      up.write(
        `${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`,
      );
      up.write(head);
      socket.pipe(up).pipe(socket);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });
  return server;
}

// The server in website mode; resolves with its port once it listens.
function startServer(env: Record<string, string>): Promise<{ child: ChildProcess; port: number }> {
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
      const listening = /listening at http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
      if (listening === null) return;
      clearTimeout(timer);
      resolve({ child, port: Number(listening[1]) });
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('exit', (code) => {
      reject(new Error(`the server stopped (${String(code)}):\n${out}`));
    });
  });
}

// Each website user signs in once more (a user who never played gets an account here) and
// deletes the game account by typing its name (D42).
async function removeAccounts(origin: string, ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    // The stub cookie on the sign-in request only: the game's session cookie it sets goes
    // into the context's jar for the calls after it (a fixed cookie header would hide it).
    const ctx = await request.newContext({ baseURL: origin });
    await ctx.get(`${SIGN_IN}?next=%2Fgames%2Fbingo%2F`, {
      maxRedirects: 0,
      headers: { cookie: `stub_user=${id}` },
    });
    const session = (await (await ctx.get('/games/bingo/api/v1/session')).json()) as {
      account: { displayName: string } | null;
      csrfToken: string;
    };
    if (session.account === null) throw new Error(`${id} is not signed in`);
    const r = await ctx.delete('/games/bingo/api/v1/me', {
      data: { displayName: session.account.displayName },
      headers: { 'x-csrf-token': session.csrfToken },
    });
    if (r.status() !== 204) throw new Error(`account of ${id} not deleted: ${String(r.status())}`);
    await ctx.dispose();
  }
}

export async function startWebsiteStack(): Promise<WebsiteStack> {
  const db = ownDatabase();
  const webDir = buildClient();
  const users = new Map<string, StubUser>();
  const app = { port: 0 };
  const proxy = startProxy(users, app);
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const address = proxy.address();
  const origin = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`;
  const server = await startServer({
    DATABASE_URL: db,
    SBR_HOST: '127.0.0.1',
    SBR_PORT: '0',
    SBR_DEV: '1',
    SBR_LOG_LEVEL: 'info',
    SBR_AUTH_MODE: 'website',
    SBR_BASE_PATH: '/games/bingo/',
    SBR_PUBLIC_URL: `${origin}/games/bingo/`,
    SBR_TRUSTED_PROXIES: '127.0.0.1',
    SBR_WEBSITE_PROXY_SECRET: SECRET,
    SBR_WEB_DIR: webDir,
    SBR_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'sbr-website-data-')),
  });
  app.port = server.port;
  return {
    origin,
    appOrigin: `http://127.0.0.1:${String(server.port)}`,
    users,
    removeAccounts: () => removeAccounts(origin, [...users.keys()]),
    close: async () => {
      server.child.kill();
      await new Promise<void>((resolve) =>
        proxy.close(() => {
          resolve();
        }),
      );
    },
  };
}
