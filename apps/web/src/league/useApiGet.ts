/**
 * @file   apps/web/src/league/useApiGet.ts
 * @module web/league
 * @brief  Loads one GET answer of the server for a page: loading, failed (with the code) or ready.
 *
 * Responsibility: ask ../shell/http `api` for the path whenever it changes and keep the
 *                 newest answer only (an older one arriving late is dropped); a null path asks
 *                 nothing and stays `idle`. Used by the leaderboard and profile pages.
 * Depends on:     react, ../shell/http
 * Used by:        ./LeaderboardPage, ./ProfilePage
 * Spec:           docs/spec/05-api-design.md §1
 */
import { useEffect, useState } from 'react';

import { api, ApiError } from '../shell/http.js';

type Loaded<T> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly code: string }
  | { readonly kind: 'ready'; readonly value: T };

export function useApiGet<T>(path: string | null): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ kind: path === null ? 'idle' : 'loading' });
  useEffect(() => {
    if (path === null) {
      setLoaded({ kind: 'idle' });
      return;
    }
    let live = true;
    setLoaded({ kind: 'loading' });
    api<T>(path).then(
      (value) => {
        if (live) setLoaded({ kind: 'ready', value });
      },
      (error: unknown) => {
        if (live)
          setLoaded({ kind: 'failed', code: error instanceof ApiError ? error.code : 'ERROR' });
      },
    );
    return () => {
      live = false;
    };
  }, [path]);
  return loaded;
}
