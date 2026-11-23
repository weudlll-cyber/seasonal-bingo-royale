/**
 * @file   apps/server/src/auth/rateLimit.ts
 * @module server/auth
 * @brief  Bingo's application rate limits (03 §13, layer 2), for the kit's RateLimiter.
 *
 * Responsibility: the rules of each route class (limit per window, keyed by IP, account or both
 *                 at the caller) and the limit of the routes outside /api. The token buckets are
 *                 the kit's `RateLimiter` (@seasonal/kit/server, since v0.11.0): soft lockout,
 *                 a retry delay, idle keys forgotten, the clock injectable. `liveRule` gives it
 *                 a rule it reads on every request, so a limit changed in the admin area's
 *                 Technical section applies at once. A Redis-backed adapter is the scale-out
 *                 step (02 §8).
 * Depends on:     @seasonal/kit/server (types)
 * Used by:        ./sessionPlugin, ../config/technical, ../http/routes/adminTechnical,
 *                 ../http/routes/auth, ../http/routes/health, ../http/routes/passwordReset,
 *                 ../http/routes/twoFactor, ../http/routes/webClient,
 *                 ../http/routes/websiteSignIn
 * Spec:           docs/spec/03-security-architecture.md §13
 */
import type { RateRule, RateRuleSource } from '@seasonal/kit/server';

// Defaults of 03 §13; the admin area's Technical section changes the limits (not the windows)
// at runtime (`liveRule`).
export const RATE_RULES = {
  loginAccountIp: { limit: 5, windowMs: 15 * 60_000 },
  loginIp: { limit: 20, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  api: { limit: 120, windowMs: 60_000 },
  // Per IP: API requests without a session (10 a second, under the proxy layer's 30, 03 §13),
  // and new guest sessions (audit S3).
  anonymous: { limit: 600, windowMs: 60_000 },
  guest: { limit: 10, windowMs: 60 * 60_000 },
  // Password reset requests per address and per e-mail; 2FA codes per pending session (D60).
  resetIp: { limit: 10, windowMs: 60 * 60_000 },
  resetAccount: { limit: 3, windowMs: 60 * 60_000 },
  twoFactor: { limit: 5, windowMs: 15 * 60_000 },
} as const satisfies Record<string, RateRule>;

// The routes outside /api (health, the client's files, the website login hop) get the
// anonymous limit per address too, as @fastify/rate-limit route config (../http/app). A new
// object per route: the plugin keeps its per-route state on the config it is given.
export function openRouteLimit(): {
  rateLimit: { max: number; timeWindow: number };
} {
  return {
    rateLimit: { max: RATE_RULES.anonymous.limit, timeWindow: RATE_RULES.anonymous.windowMs },
  };
}

// The limits the Technical section changes, by rule (the window stays the default's).
export type LiveLimits = () => Readonly<Record<TechnicalRule, number>>;
export type TechnicalRule = Exclude<keyof typeof RATE_RULES, 'anonymous'>;

// A rule whose limit is read from the Technical settings on every request (the kit reads a
// function rule on every `take`); today's fixed rule without them. The settings keep every
// limit at 1 or more (@sbr/contracts technical), as the kit requires.
export function liveRule(name: TechnicalRule, limits?: LiveLimits): RateRuleSource {
  if (limits === undefined) return RATE_RULES[name];
  return () => ({ limit: limits()[name], windowMs: RATE_RULES[name].windowMs });
}
