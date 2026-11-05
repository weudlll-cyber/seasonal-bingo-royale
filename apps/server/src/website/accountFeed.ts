/**
 * @file   apps/server/src/website/accountFeed.ts
 * @module server/website
 * @brief  Website mode: polls the website's account-changes feed and applies each change (07 §2.4).
 *
 * Responsibility: every 2 minutes GET <feed>?since=<cursor> with X-Games-Sync-Token over the
 *                 website's Docker network; follow `next` until a page brings no changes (at
 *                 most 20 pages a poll), applying each change (./accountChanges) and storing the
 *                 cursor as a string in sbr.website_feed after each page. A failing feed
 *                 (network, 401, 404, a malformed answer) is retried at the next poll and noted
 *                 in <data dir>/website-feed for `sbr status`; play goes on. Unknown kinds are
 *                 logged once and treated like "rights". The token is never logged.
 * Depends on:     node:fs, node:path, zod, ../db/pool, ./accountChanges
 * Used by:        ../http/app
 * Spec:           docs/spec/07-integration-architecture.md §2.4; docs/spec/09-deployment-architecture.md §3
 */
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import type { DbPool } from '../db/pool.js';
import { applyChange, KINDS, type ChangeDeps } from './accountChanges.js';

const MAX_PAGES = 20;

const answerSchema = z.object({
  changes: z
    .array(z.object({ id: z.number().int().nonnegative(), kind: z.string().max(40) }))
    .max(500),
  next: z.string().regex(/^[0-9]{1,30}$/),
});

type Answer = z.infer<typeof answerSchema>;

export interface FeedDeps extends ChangeDeps {
  readonly url: string;
  readonly token: string;
  readonly dataDir: string;
  readonly warn: (message: string) => void;
}

async function readCursor(pool: DbPool): Promise<string> {
  const r = await pool.query<{ cursor: string }>('SELECT cursor FROM sbr.website_feed');
  return r.rows[0]?.cursor ?? '0';
}

async function saveCursor(pool: DbPool, cursor: string): Promise<void> {
  await pool.query(
    `INSERT INTO sbr.website_feed (id, cursor) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = now()`,
    [cursor],
  );
}

export class AccountFeed {
  // Unknown kinds already logged (once each).
  private readonly unknown = new Set<string>();

  constructor(private readonly deps: FeedDeps) {}

  // One poll: every page until an empty one. Never throws.
  async poll(): Promise<void> {
    const status = path.join(this.deps.dataDir, 'website-feed');
    try {
      let cursor = await readCursor(this.deps.pool);
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const answer = await this.page(cursor);
        for (const change of answer.changes) await applyChange(this.deps, this.known(change));
        if (answer.next !== cursor) await saveCursor(this.deps.pool, answer.next);
        cursor = answer.next;
        if (answer.changes.length === 0) break;
      }
      rmSync(status, { force: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.deps.warn(`website account-changes feed failed: ${reason}`);
      writeFileSync(status, `failed at ${new Date().toISOString()}: ${reason}\n`);
    }
  }

  // Polls every `everyMs`; returns the stop function.
  start(everyMs: number): () => void {
    const timer = setInterval(() => void this.poll(), everyMs);
    return () => {
      clearInterval(timer);
    };
  }

  private async page(cursor: string): Promise<Answer> {
    const url = `${this.deps.url}?since=${cursor}`;
    const r = await fetch(url, {
      headers: { 'x-games-sync-token': this.deps.token, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`the feed answered ${String(r.status)}`);
    return answerSchema.parse(await r.json());
  }

  // An unknown kind is logged once and handled like "rights".
  private known(change: Answer['changes'][number]) {
    if ((KINDS as readonly string[]).includes(change.kind)) return change;
    if (!this.unknown.has(change.kind)) {
      this.unknown.add(change.kind);
      this.deps.warn(
        `website account-changes feed: unknown kind "${change.kind}" treated as rights`,
      );
    }
    return { ...change, kind: 'rights' };
  }
}
