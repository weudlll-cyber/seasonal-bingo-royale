/**
 * @file   apps/server/src/http/signIn.ts
 * @module server/http
 * @brief  How players sign in: the routes of the install's mode, and the website's account feed.
 *
 * Responsibility: local mode: registration and password sign-in (./routes/auth), "Forgot
 *                 password?" with mail (./routes/passwordReset, D60), admins' second step
 *                 (./routes/twoFactor, D60) and in development the quick sign-in; website mode:
 *                 only the website's sign-in route (./routes/websiteSignIn, D37) and, with the
 *                 sync token, the account-changes feed returned for main (../website/accountFeed).
 * Depends on:     fastify, ../auth/*, ../config/*, ../db/pool (types), ../website/accountFeed,
 *                 ./routes/auth, ./routes/devSignIn, ./routes/passwordReset, ./routes/twoFactor,
 *                 ./routes/websiteSignIn
 * Used by:        ./app
 * Spec:           docs/spec/07-integration-architecture.md §2; docs/spec/03-security-architecture.md §1
 */
import type { FastifyInstance } from 'fastify';

import { mailerFrom, type Mailer } from '../auth/mailer.js';
import type { SessionEnds } from '../auth/sessionEnds.js';
import type { CookieConfig } from '../auth/sessionPlugin.js';
import type { Env } from '../config/env.js';
import { featuresFrom } from '../config/features.js';
import { seedKeyFrom } from '../config/seedKey.js';
import type { DbPool } from '../db/pool.js';
import { AccountFeed } from '../website/accountFeed.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDevSignIn } from './routes/devSignIn.js';
import { registerPasswordReset } from './routes/passwordReset.js';
import { registerTwoFactor } from './routes/twoFactor.js';
import { registerWebsiteSignIn } from './routes/websiteSignIn.js';

// How players sign in: the game's own accounts, or in website mode only through the
// website (D37); in development (local mode) also the quick sign-in, never in production.
// Website mode with the sync token: the account-changes feed (07 §2.4), returned for main.
export function registerSignIn(
  fastify: FastifyInstance,
  deps: {
    env: Env;
    pool: DbPool;
    cookie: CookieConfig;
    sessionEnds: SessionEnds;
    accountDeleted: (accountId: string) => void;
    mailer?: Mailer | null | undefined;
  },
): AccountFeed | null {
  const { env } = deps;
  // Password reset: standalone installs with mail only (D60).
  const mailer = env.SBR_AUTH_MODE === 'local' ? (deps.mailer ?? mailerFrom(env)) : null;
  registerPasswordReset(fastify, {
    ...deps,
    mailer,
    publicUrl: env.SBR_PUBLIC_URL ?? null,
    basePath: env.SBR_BASE_PATH,
  });
  // Local admins' second sign-in step (TOTP, D60); the website does its own.
  if (env.SBR_AUTH_MODE === 'local')
    registerTwoFactor(fastify, { ...deps, seedKey: seedKeyFrom(env) });
  registerAuthRoutes(fastify, {
    ...deps,
    features: { ...featuresFrom(env), passwordReset: mailer !== null },
    mode: env.SBR_AUTH_MODE,
    basePath: env.SBR_BASE_PATH,
    chat: { path: env.SBR_CHAT_PATH, room: env.SBR_CHAT_ROOM },
  });
  registerWebsiteSignIn(fastify, deps);
  if (env.SBR_DEV && env.SBR_AUTH_MODE === 'local') registerDevSignIn(fastify, deps);
  if (env.SBR_AUTH_MODE !== 'website' || env.SBR_WEBSITE_SYNC_TOKEN === undefined) return null;
  return new AccountFeed({
    ...deps,
    issuer: new URL(env.SBR_PUBLIC_URL ?? '').origin,
    url: env.SBR_WEBSITE_FEED_URL,
    token: env.SBR_WEBSITE_SYNC_TOKEN,
    dataDir: env.SBR_DATA_DIR,
    warn: (message) => {
      fastify.log.warn(message);
    },
  });
}
