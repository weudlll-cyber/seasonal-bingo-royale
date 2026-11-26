/**
 * @file   apps/server/src/loadOrigin.test.ts
 * @module server
 * @brief  The load check's writes pass the server's write check (kit K60).
 *
 * Responsibility: `sbr loadcheck` calls the app by its internal address while players' pages name
 *                 the public one. A write whose Origin is not the host it is sent to is refused,
 *                 so the generator's HTTP calls (load/common.mjs) must name the origin they call;
 *                 the public origin is for the WebSocket only.
 * Depends on:     vitest, @seasonal/kit/server (writeCheck), ../../../load/common.mjs
 * Spec:           docs/spec/03-security-architecture.md §8; docs/spec/12-testing-strategy.md §5
 */
import { writeCheck } from '@seasonal/kit/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const COMMON = new URL('../../../load/common.mjs', import.meta.url).href;

interface Load {
  signIn: (as: string) => Promise<object>;
  call: (client: object, method: string, path: string, body?: unknown) => Promise<unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the load check against an install', () => {
  it('sends writes the app accepts: it names the origin it calls', async () => {
    vi.stubEnv('SBR_LOAD_BASE', 'http://app:3000/games/bingo');
    vi.stubEnv('SBR_LOAD_ORIGIN', 'https://example.org');
    const writes: { url: string; origin: string }[] = [];
    vi.stubGlobal(
      'fetch',
      (url: string, init?: { method?: string; headers: Record<string, string> }) => {
        if (init?.method !== undefined) writes.push({ url, origin: init.headers['origin'] ?? '' });
        return Promise.resolve(new Response(JSON.stringify({ displayName: 'load-001' })));
      },
    );
    const load = (await import(/* @vite-ignore */ COMMON)) as Load;
    const client = await load.signIn('load-001');
    await load.call(client, 'POST', '/matches', {});
    const check = writeCheck();
    expect(writes).toHaveLength(2);
    for (const { url, origin } of writes) {
      const headers = { host: new URL(url).host, origin };
      expect(check({ method: 'POST', headers, peer: '10.0.0.2' })).toEqual({ ok: true });
    }
  });
});
