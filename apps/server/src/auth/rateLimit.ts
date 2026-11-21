/**
 * @file   apps/server/src/auth/rateLimit.ts
 * @module server/auth
 * @brief  In-memory token buckets for the application rate limits (03 §13, layer 2).
 *
 * Responsibility: one limiter per route class, keyed by IP, account or both; each key has
 *                 `limit` tokens refilled evenly over `windowMs`. `take` answers whether a
 *                 request may pass and, if not, after how many milliseconds to retry. The
 *                 clock is injected so tests do not wait. A Redis-backed adapter is the
 *                 scale-out step (02 §8). Lockout is soft: callers get a delay, never a lock.
 *                 Keys idle for a whole window are pruned, so the maps stay small. A rule may be
 *                 read on every request, so a limit changed in the admin area applies at once.
 * Depends on:     nothing
 * Used by:        ./sessionPlugin, ../http/routes/auth, ../http/routes/health,
 *                 ../http/routes/webClient, ../http/routes/websiteSignIn, ../realtime/intents
 * Spec:           docs/spec/03-security-architecture.md §13
 */

interface RateRule {
  readonly limit: number;
  readonly windowMs: number;
}

interface RateDecision {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private takes = 0;

  // `rule` may be a function: read on every request, so a changed limit applies at once
  // (the admin area's Technical section, admin-area §9 piece 7).
  constructor(
    private readonly rules: RateRule | (() => RateRule),
    private readonly now: () => number = Date.now,
  ) {}

  private get rule(): RateRule {
    return typeof this.rules === 'function' ? this.rules() : this.rules;
  }

  take(key: string): RateDecision {
    const t = this.now();
    const rule = this.rule;
    // Every 1000 requests, forget keys idle for a whole window (their bucket is full again).
    if ((this.takes += 1) % 1000 === 0) this.prune(t);
    const refillPerMs = rule.limit / rule.windowMs;
    const bucket = this.buckets.get(key) ?? { tokens: rule.limit, updatedAt: t };
    bucket.tokens = Math.min(rule.limit, bucket.tokens + (t - bucket.updatedAt) * refillPerMs);
    bucket.updatedAt = t;
    this.buckets.set(key, bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, retryAfterMs: 0 };
    }
    return { allowed: false, retryAfterMs: Math.ceil((1 - bucket.tokens) / refillPerMs) };
  }

  // How many keys are held (tests watch the pruning).
  get size(): number {
    return this.buckets.size;
  }

  private prune(t: number): void {
    for (const [key, bucket] of this.buckets) {
      if (t - bucket.updatedAt >= this.rule.windowMs) this.buckets.delete(key);
    }
  }
}

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

// A rule whose limit is read from the Technical settings on every request; today's without them.
export function liveRule(name: TechnicalRule, limits?: LiveLimits): RateRule | (() => RateRule) {
  if (limits === undefined) return RATE_RULES[name];
  return () => ({ limit: limits()[name], windowMs: RATE_RULES[name].windowMs });
}
