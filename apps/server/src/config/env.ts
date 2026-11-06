/**
 * @file   apps/server/src/config/env.ts
 * @module server/config
 * @brief  Validates runtime environment variables at startup.
 *
 * Responsibility: parse process.env with a strict zod schema, exit with a readable
 *                 message on invalid or missing values, expose a typed Env object; the
 *                 deployment settings (base path, public URL, trusted proxies, client and
 *                 data directories, 09 §1), the WebSocket origins derived from them and the
 *                 sign-in mode with the website's identity header names (D37; website mode
 *                 needs the public address and the trusted proxies).
 *                 Fail closed: NODE_ENV defaults to production and development features
 *                 need SBR_DEV=1, which is refused for a public (non-localhost) address.
 * Depends on:     zod
 * Used by:        ../main.ts, ../http/app.ts, ../cli, ./features, ./seedKey, ../index,
 *                 ../auth/websiteIdentity, ../http/routes/websiteSignIn
 * Spec:           docs/spec/08-devops-architecture.md §5, §1.1; docs/spec/07-integration-architecture.md §2.3
 */
import { z } from 'zod';

// An HTTP header name (`fallback` when unset), kept lower-case as Node hands headers over.
const headerName = (fallback: string) =>
  z
    .string()
    .regex(/^[A-Za-z0-9-]{1,64}$/)
    .default(fallback)
    .transform((v) => v.toLowerCase());

// The port range stays open so test runs can bind to an ephemeral port (0 → kernel picks).
// Local dev uses the fixed project port 3900 (08 §1.1).
const envSchema = z.object({
  // Fail closed: without NODE_ENV the server runs as production.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  // Development features (quick sign-in, Quick Test, fast test rules, bots, system-abort
  // route, load accounts, a cookie without Secure) exist only with SBR_DEV=1 (audit S1).
  SBR_DEV: z.stringbool().default(false),
  SBR_HOST: z.string().min(1).default('127.0.0.1'),
  SBR_PORT: z.coerce.number().int().min(0).max(65535).default(3900),
  // One libpq URL; the integration test overrides it with the Testcontainers URL.
  DATABASE_URL: z.url(),
  // apply: migrate at start (development, the test suites); check: refuse to start while a
  // migration is missing, which the owner role applies first (production, `cli migrate`).
  SBR_MIGRATIONS: z.enum(['apply', 'check']).default('apply'),
  SBR_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  // Feature flags (./features): e-mail verification and 2FA off, guests on.
  SBR_FEATURE_EMAIL_VERIFICATION: z.stringbool().default(false),
  SBR_FEATURE_TWO_FACTOR: z.stringbool().default(false),
  SBR_FEATURE_GUESTS: z.stringbool().default(true),
  // Browser origins allowed to open the WebSocket (06 §2), comma-separated; without it the
  // public URL's origin, else the local player and admin clients (allowedOrigins below).
  SBR_ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((v) =>
      v
        ?.split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0),
    ),
  // AES-256 key (64 hex characters) that seals match seeds at rest (04 §3.3 seed_enc);
  // required in production, a fixed development key otherwise (./seedKey).
  SBR_SEED_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  // Where the app is reachable: "/" standalone, "/games/bingo/" inside the website (09 §1).
  SBR_BASE_PATH: z
    .string()
    .regex(/^\/([\w-]+\/)*$/, 'starts and ends with "/", e.g. /games/bingo/')
    .default('/'),
  // The public address (https://bingo.example.org/); its origin may open the WebSocket.
  SBR_PUBLIC_URL: z.url().optional(),
  // Proxies whose X-Forwarded-For is believed (Caddy's address); none by default.
  SBR_TRUSTED_PROXIES: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
    ),
  // The built player client (index.html, assets/); the image sets it, development has none.
  SBR_WEB_DIR: z.string().optional(),
  // A writable directory (the uploads volume in production) for the maintenance flag.
  SBR_DATA_DIR: z.string().default('./data'),
  // Outgoing e-mail (password reset in standalone installs, D60); without a host no mail is
  // sent and the reset is off. The installer asks for these; locally Mailpit (port 1090).
  SBR_SMTP_HOST: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  SBR_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SBR_SMTP_USER: z.string().optional(),
  SBR_SMTP_PASSWORD: z.string().optional(),
  SBR_SMTP_FROM: z.string().default('Seasonal Bingo Royale <bingo@localhost>'),
  // How players sign in (D37): the game's own accounts (standalone), or only through the
  // website login, whose proxy passes the visitor as headers to GET <base>auth/website.
  SBR_AUTH_MODE: z.enum(['local', 'website']).default('local'),
  // The identity headers' names (07 §2.3); the defaults match the website's bot-admin page.
  SBR_WEBSITE_HEADER_ID: headerName('X-Acting-User-Id'),
  SBR_WEBSITE_HEADER_NAME: headerName('X-Acting-User'),
  SBR_WEBSITE_HEADER_ROLES: headerName('X-Acting-User-Roles'),
  SBR_WEBSITE_HEADER_EMAIL_VERIFIED: headerName('X-Acting-User-Email-Verified'),
  // May host matches (true|false, 2026-11-04), the Discord steps (base64url JSON), and the
  // website's answer for a visitor it does not sign in (X-Acting-Guest: true).
  SBR_WEBSITE_HEADER_CAN_HOST: headerName('X-Acting-User-Can-Host'),
  SBR_WEBSITE_HEADER_STEPS: headerName('X-Acting-User-Steps'),
  SBR_WEBSITE_HEADER_GUEST: headerName('X-Acting-Guest'),
  // The website's account-changes feed (07 §2.4), reached over the website's Docker network,
  // and the token the installer copies from /etc/seasonal/games-sync-token; without the token
  // the feed job stays idle. Polled every 2 minutes.
  SBR_WEBSITE_FEED_URL: z.url().default('http://site:3800/api/games/bingo/account-changes'),
  SBR_WEBSITE_SYNC_TOKEN: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  ),
  SBR_WEBSITE_FEED_INTERVAL_MS: z.coerce.number().int().min(1_000).default(120_000),
  // The secret the game's proxy route sends in X-Sbr-Proxy-Secret with the identity headers
  // (website mode needs it; the installer generates it). No other process knows it.
  SBR_WEBSITE_PROXY_SECRET: z.string().min(32).max(256).optional(),
  // The website's login page; the return path is appended URL-encoded (D43). A path on the
  // website's own origin, never another site.
  SBR_WEBSITE_LOGIN_PATH: z
    .string()
    .regex(/^\/(?![/\\])[\x21-\x7e]*$/, 'a path on the website, e.g. /login?next=')
    .default('/login?next='),
});

export type Env = z.infer<typeof envSchema>;

const DEV_ORIGINS = [
  'http://localhost:5390',
  'http://127.0.0.1:5390',
  'http://localhost:5391',
  'http://127.0.0.1:5391',
];

// The origins allowed to open the WebSocket: the list given, else the public URL's, else
// the local development clients.
export function allowedOrigins(env: Env): readonly string[] {
  if (env.SBR_ALLOWED_ORIGINS !== undefined) return env.SBR_ALLOWED_ORIGINS;
  if (env.SBR_PUBLIC_URL !== undefined) return [new URL(env.SBR_PUBLIC_URL).origin];
  return DEV_ORIGINS;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// Development features on a public address would be an open door: refuse to start.
function checkDevSafe(env: Env): Env {
  if (env.SBR_DEV && env.SBR_PUBLIC_URL !== undefined) {
    const host = new URL(env.SBR_PUBLIC_URL).hostname;
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error(
        `SBR_DEV=1 is refused for the public address ${host}: development features stay on localhost`,
      );
    }
  }
  return env;
}

// Website mode needs the public address (its origin is the identity issuer), the proxy
// whose headers it believes and the secret that proxy sends (07 §2.3).
function checkWebsiteMode(env: Env): Env {
  if (env.SBR_AUTH_MODE !== 'website') return env;
  if (
    env.SBR_PUBLIC_URL === undefined ||
    env.SBR_TRUSTED_PROXIES.length === 0 ||
    env.SBR_WEBSITE_PROXY_SECRET === undefined
  ) {
    throw new Error(
      'SBR_AUTH_MODE=website needs SBR_PUBLIC_URL, SBR_TRUSTED_PROXIES and SBR_WEBSITE_PROXY_SECRET',
    );
  }
  return env;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return checkWebsiteMode(checkDevSafe(parsed.data));
  // Keep the message compact — users running `pnpm dev` without a .env file need the hint,
  // not a wall of zod issues.
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment:\n${issues}`);
}
