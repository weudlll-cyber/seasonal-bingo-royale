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
 * Depends on:     nothing
 * Used by:        ../http/routes/auth, ../realtime/gateway
 * Spec:           docs/spec/03-security-architecture.md §13
 */

export interface RateRule {
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateDecision {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly rule: RateRule,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): RateDecision {
    const t = this.now();
    const refillPerMs = this.rule.limit / this.rule.windowMs;
    const bucket = this.buckets.get(key) ?? { tokens: this.rule.limit, updatedAt: t };
    bucket.tokens = Math.min(this.rule.limit, bucket.tokens + (t - bucket.updatedAt) * refillPerMs);
    bucket.updatedAt = t;
    this.buckets.set(key, bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, retryAfterMs: 0 };
    }
    return { allowed: false, retryAfterMs: Math.ceil((1 - bucket.tokens) / refillPerMs) };
  }
}

// Defaults of 03 §13. Settings in admin (WP-20) replace these values later.
export const RATE_RULES = {
  loginAccountIp: { limit: 5, windowMs: 15 * 60_000 },
  loginIp: { limit: 20, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  api: { limit: 120, windowMs: 60_000 },
} as const satisfies Record<string, RateRule>;
