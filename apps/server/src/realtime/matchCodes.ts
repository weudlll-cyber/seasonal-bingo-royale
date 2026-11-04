/**
 * @file   apps/server/src/realtime/matchCodes.ts
 * @module server/realtime
 * @brief  Match code → match id for the socket intents, asked once per code (12 §5).
 *
 * Responsibility: every tap names its match by code; asking the database each time put a
 *                 query per tap in front of the engine and on the pool its batches need (the
 *                 tap breakdown: a mean of 122 ms per tap with 200 tapping players). A match
 *                 never changes its code and is never deleted (aborted at most), so a code once
 *                 found is kept; a code not found is asked again (a match created a moment
 *                 later). At most `max` codes are kept: the oldest go first.
 * Depends on:     ../db/pool
 * Used by:        ./intents, ./gateway
 * Spec:           docs/spec/12-testing-strategy.md §5; docs/spec/06-realtime-architecture.md §4
 */
import type { DbPool } from '../db/pool.js';

export class MatchCodes {
  private readonly ids = new Map<string, string>();

  constructor(
    private readonly pool: DbPool,
    private readonly max = 10_000,
  ) {}

  get size(): number {
    return this.ids.size;
  }

  // The match id of `code`, or null when no match has it.
  async idOf(code: string): Promise<string | null> {
    const known = this.ids.get(code);
    if (known !== undefined) return known;
    const r = await this.pool.query<{ id: string }>('SELECT id FROM sbr.matches WHERE code = $1', [
      code,
    ]);
    const id = r.rows[0]?.id;
    if (id === undefined) return null;
    if (this.ids.size >= this.max) {
      const oldest = this.ids.keys().next().value;
      if (oldest !== undefined) this.ids.delete(oldest);
    }
    this.ids.set(code, id);
    return id;
  }
}
