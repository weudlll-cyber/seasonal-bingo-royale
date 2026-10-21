/**
 * @file   apps/server/src/config/env.ts
 * @module server/config
 * @brief  Validates runtime environment variables at startup.
 *
 * Responsibility: parse process.env with a strict zod schema, exit with a readable
 *                 message on invalid or missing values, expose a typed Env object.
 * Depends on:     zod
 * Used by:        ../main.ts, ../http/app.ts, ../db/pool.ts
 * Spec:           docs/spec/08-devops-architecture.md §5, docs/spec/08-devops-architecture.md §1.1
 */
import { z } from 'zod';

// The port range stays open so test runs can bind to an ephemeral port (0 → kernel picks).
// Local dev uses the fixed project port 3900 (08 §1.1).
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SBR_HOST: z.string().min(1).default('127.0.0.1'),
  SBR_PORT: z.coerce.number().int().min(0).max(65535).default(3900),
  // One libpq URL; the integration test overrides it with the Testcontainers URL.
  DATABASE_URL: z.url(),
  SBR_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  // Feature flags (./features): e-mail verification and 2FA off, guests on.
  SBR_FEATURE_EMAIL_VERIFICATION: z.stringbool().default(false),
  SBR_FEATURE_TWO_FACTOR: z.stringbool().default(false),
  SBR_FEATURE_GUESTS: z.stringbool().default(true),
  // AES-256 key (64 hex characters) that seals match seeds at rest (04 §3.3 seed_enc);
  // Browser origins allowed to open the WebSocket (06 §2), comma-separated; defaults to
  // the local player and admin clients.
  SBR_ALLOWED_ORIGINS: z
    .string()
    .default(
      'http://localhost:5390,http://127.0.0.1:5390,http://localhost:5391,http://127.0.0.1:5391',
    )
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0),
    ),
  // required in production, a fixed development key otherwise (./seedKey).
  SBR_SEED_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  // Keep the message compact — users running `pnpm dev` without a .env file need the hint,
  // not a wall of zod issues.
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment:\n${issues}`);
}
