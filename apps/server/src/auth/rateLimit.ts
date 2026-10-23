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
 *                 Keys idle for a whole window are pruned, so the maps stay small.
 * Depends on:     nothing
 * Used by:        ./sessionPlugin, ../http/routes/auth, ../realtime/intents
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

  constructor(
    private readonly rule: RateRule,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): RateDecision {
    const t = this.now();
    // Every 1000 requests, forget keys idle for a whole window (their bucket is full again).
    if ((this.takes += 1) % 1000 === 0) this.prune(t);
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

// Defaults of 03 §13. Settings in admin (WP-20) replace these values later.
export const RATE_RULES = {
  loginAccountIp: { limit: 5, windowMs: 15 * 60_000 },
  loginIp: { limit: 20, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  api: { limit: 120, windowMs: 60_000 },
  // Per IP: API requests without a session (10 a second, under the proxy layer's 30, 03 §13),
  // and new guest sessions (audit S3).
  anonymous: { limit: 600, windowMs: 60_000 },
  guest: { limit: 10, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateRule>;
