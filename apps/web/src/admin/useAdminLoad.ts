/**
 * @file   apps/web/src/admin/useAdminLoad.ts
 * @module web/admin
 * @brief  An admin page's values: loaded on mount and on reload(), each answer a new version.
 *
 * Responsibility: GET <path> when the page mounts and whenever reload() is called (after a
 *                 save); each answer is a new version, so the page's form remounts with the
 *                 server's values. The answer to a mount's load that arrives after that mount
 *                 was left is dropped: React's StrictMode mounts a page twice in development,
 *                 and a late first answer would remount the form and drop what the admin
 *                 typed (CI run 45043180902). Display only; the server checks every value.
 * Depends on:     react, ../shell/http
 * Used by:        ./AdminLeague, ./AdminScreens, ./AdminTechnical
 * Spec:           docs/concepts/admin-area.md §4
 */
import { useCallback, useEffect, useState } from 'react';

import { api } from '../shell/http.js';

interface Loaded<T> {
  readonly data: T | null;
  readonly version: number;
}

export function useAdminLoad<T>(
  path: string,
  onError: (e: unknown) => void,
): Loaded<T> & { readonly reload: () => void } {
  const [loaded, setLoaded] = useState<Loaded<T>>({ data: null, version: 0 });
  // `live` says whether the load's answer still counts when it comes.
  const load = useCallback(
    (live: () => boolean) => {
      api<T>(path)
        .then((data) => {
          if (live()) setLoaded((l) => ({ data, version: l.version + 1 }));
        })
        .catch((e: unknown) => {
          if (live()) onError(e);
        });
    },
    [path, onError],
  );
  useEffect(() => {
    let live = true;
    load(() => live);
    return () => {
      live = false;
    };
  }, [load]);
  const reload = useCallback(() => {
    load(() => true);
  }, [load]);
  return { ...loaded, reload };
}
