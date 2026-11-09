/**
 * @file   apps/server/test/websiteRoute.integration.test.ts
 * @module server/test
 * @brief  The game's route file in a real nginx and a real Caddy: whose cookies reach whom.
 *
 * Responsibility: the route files ops/lib/websiteRoute.sh writes (nginx and own-Caddy mode,
 *                 the same functions the installer calls; only the upstream addresses point at
 *                 this test's stand-ins) run in nginx and Caddy containers. A stand-in website
 *                 answers the authorize request and records the Cookie it got; a stand-in game
 *                 app records the Cookie of each request and accepts the WebSocket upgrade.
 *                 The website's session cookie (`__Host-se.sid`, `se.sid` without Secure) goes
 *                 to the website's authorize request only, never to the game (HTTP, the sign-in
 *                 route, the WebSocket upgrade); the game's own cookies still reach it, the
 *                 sign-in route still carries the website's answer, the upgrade still answers 101.
 * Depends on:     vitest, testcontainers, node:http, node:child_process, ops/lib/websiteRoute.sh
 * Spec:           docs/spec/09-deployment-architecture.md §3; docs/spec/07-integration-architecture.md §2.3
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { GenericContainer, TestContainers, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SUITE_TIMEOUT_MS } from './harness.js';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const HOST = 'host.testcontainers.internal';
const SECRET = 'ab'.repeat(32);
// The browser's cookies: the game's session, the website's session and another site cookie.
const BROWSER = 'sbr_session=game1; __Host-se.sid=web1; theme=dark';

interface Seen {
  site: string[];
  app: { path: string; cookie: string; id: string; secret: string }[];
}
const seen: Seen = { site: [], app: [] };
let site: http.Server;
let app: http.Server;

const listen = (server: http.Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, '0.0.0.0', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });

// The website's authorize endpoint: a member for its session cookie, a guest without one.
function startSite(): http.Server {
  return http.createServer((req, res) => {
    const cookie = req.headers.cookie ?? '';
    seen.site.push(cookie);
    const member = /(^|; )(__Host-)?se\.sid=/.test(cookie);
    res.writeHead(
      204,
      member
        ? { 'X-Acting-User-Id': '7', 'X-Acting-User': 'Walter' }
        : { 'X-Acting-Guest': 'true' },
    );
    res.end();
  });
}

// The game app: what each request carried; the WebSocket upgrade answered with 101.
function startApp(): http.Server {
  const record = (req: http.IncomingMessage): void => {
    seen.app.push({
      path: req.url ?? '',
      cookie: req.headers.cookie ?? '',
      id: String(req.headers['x-acting-user-id'] ?? ''),
      secret: String(req.headers['x-sbr-proxy-secret'] ?? ''),
    });
  };
  const server = http.createServer((req, res) => {
    record(req);
    res.end('game');
  });
  server.on('upgrade', (req: http.IncomingMessage, socket) => {
    record(req);
    socket.end(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    );
  });
  return server;
}

// The route file the installer writes for this mode, its upstreams pointed at the stand-ins.
function routeFile(mode: 'nginx' | 'caddy', appPort: number, sitePort: number): string {
  const script = [
    'set -e',
    'source ops/lib/common.sh',
    'source ops/lib/website.sh',
    'source ops/lib/websiteRoute.sh',
    'SBR_ETC=$(mktemp -d)',
    `printf 'SBR_WEBSITE_PROXY_SECRET=${SECRET}\\n' >"$SBR_ETC/test.env"`,
    'header_names test',
    `SBR_APP_PORT=${String(appPort)}`,
    `SBR_WEBSITE_UPSTREAM=${HOST}:${String(sitePort)}`,
    'SBR_WEBSITE_AUTHORIZE_PATH=/api/games/bingo/authorize',
    'SBR_WEBSITE_ROUTES_DIR=/etc/nginx/routes',
    `write_${mode}_route test`,
  ].join('\n');
  const r = spawnSync('bash', ['-c', script], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`route file: ${r.stderr}`);
  return r.stdout
    .replaceAll(`http://127.0.0.1:${String(appPort)}`, `http://${HOST}:${String(appPort)}`)
    .replaceAll('sbr-bingo-test:3000', `${HOST}:${String(appPort)}`);
}

const NGINX_CONF = `events {}
http {
  server {
    listen 80;
    include /etc/nginx/routes/bingo.conf;
    location / { return 200 "site"; }
  }
}
`;
const CADDYFILE = `{
	auto_https off
	admin off
}
:80 {
	import /etc/caddy/routes/*.caddy
	respond "site"
}
`;

async function startProxy(mode: 'nginx' | 'caddy', route: string): Promise<StartedTestContainer> {
  const files =
    mode === 'nginx'
      ? [
          { content: NGINX_CONF, target: '/etc/nginx/nginx.conf' },
          { content: route, target: '/etc/nginx/routes/bingo.conf' },
        ]
      : [
          { content: CADDYFILE, target: '/etc/caddy/Caddyfile' },
          { content: route, target: '/etc/caddy/routes/bingo.caddy' },
        ];
  return new GenericContainer(mode === 'nginx' ? 'nginx:1.27-alpine' : 'caddy:2.10-alpine')
    .withCopyContentToContainer(files)
    .withExposedPorts(80)
    .start();
}

// One request through the proxy; `upgrade` asks for the WebSocket. Resolves with the status.
function request(
  proxy: StartedTestContainer,
  path: string,
  upgrade = false,
  cookie = BROWSER,
): Promise<number> {
  const headers: Record<string, string> = { Cookie: cookie, Origin: 'http://example.org' };
  if (upgrade) {
    Object.assign(headers, {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
      'Sec-WebSocket-Version': '13',
    });
  }
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxy.getHost(),
      port: proxy.getMappedPort(80),
      path,
      headers,
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve(res.statusCode ?? 0);
    });
    req.on('response', (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

const proxies = new Map<'nginx' | 'caddy', StartedTestContainer>();

beforeAll(async () => {
  site = startSite();
  app = startApp();
  const [sitePort, appPort] = [await listen(site), await listen(app)];
  await TestContainers.exposeHostPorts(sitePort, appPort);
  for (const mode of ['nginx', 'caddy'] as const) {
    proxies.set(mode, await startProxy(mode, routeFile(mode, appPort, sitePort)));
  }
}, SUITE_TIMEOUT_MS);

afterAll(async () => {
  for (const proxy of proxies.values()) await proxy.stop();
  site.close();
  app.close();
}, SUITE_TIMEOUT_MS);

const last = () => seen.app.at(-1);
const proxyOf = (mode: 'nginx' | 'caddy'): StartedTestContainer => {
  const proxy = proxies.get(mode);
  if (proxy === undefined) throw new Error(`no ${mode} container`);
  return proxy;
};

describe.each(['nginx', 'caddy'] as const)('the route file in %s', (mode) => {
  it('gives the game its own cookies on every path, never the website session', async () => {
    expect(await request(proxyOf(mode), '/games/bingo/api/v1/session')).toBe(200);
    expect(last()?.cookie).toBe('sbr_session=game1; theme=dark');
  });

  it('drops se.sid (without Secure) at the start of the header too', async () => {
    const cookie = 'se.sid=web2; sbr_session=game2';
    expect(await request(proxyOf(mode), '/games/bingo/', false, cookie)).toBe(200);
    expect(last()?.cookie.replace(/^; /, '')).toBe('sbr_session=game2');
  });

  it('asks the website with its session on the sign-in route, then gives the game its answer only', async () => {
    seen.site.length = 0;
    expect(await request(proxyOf(mode), '/games/bingo/auth/website?next=%2Fgames%2Fbingo%2F')).toBe(
      200,
    );
    expect(seen.site).toEqual([BROWSER]);
    expect(last()).toMatchObject({
      id: '7',
      secret: SECRET,
      cookie: 'sbr_session=game1; theme=dark',
    });
  });

  it('upgrades the game socket without the website session', async () => {
    expect(await request(proxyOf(mode), '/games/bingo/ws/?EIO=4&transport=websocket', true)).toBe(
      101,
    );
    expect(last()).toMatchObject({
      path: '/games/bingo/ws/?EIO=4&transport=websocket',
      cookie: 'sbr_session=game1; theme=dark',
    });
  });
});
