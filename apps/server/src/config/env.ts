/**
 * @file   apps/server/src/config/env.ts
 * @module server/config
 * @brief  Validates runtime environment variables at startup.
 *
 * Responsibility: parse process.env with a strict zod schema, exit with a readable
 *                 message on invalid or missing values, expose a typed Env object; the
 *                 deployment settings (base path, public URL, trusted proxies, client and
 *                 data directories, 09 §1) and the WebSocket origins derived from them.
 *                 Fail closed: NODE_ENV defaults to production and development features
 *                 need SBR_DEV=1, which is refused for a public (non-localhost) address.
 * Depends on:     zod
 * Used by:        ../main.ts, ../http/app.ts, ../db/pool.ts
 * Spec:           docs/spec/08-devops-architecture.md §5, docs/spec/08-devops-architecture.md §1.1
 */
import { z } from 'zod';

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

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return checkDevSafe(parsed.data);
  // Keep the message compact — users running `pnpm dev` without a .env file need the hint,
  // not a wall of zod issues.
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment:\n${issues}`);
}
