/**
 * @file   apps/web/src/shell/http.ts
 * @module web/shell
 * @brief  JSON calls to the server's /api/v1 with the session cookie and CSRF token.
 *
 * Responsibility: one fetch wrapper for the real game, relative to where the client is
 *                 served (BASE_PATH): same-origin credentials (the dev server proxies /api), the session's CSRF token on every state-changing
 *                 call (03 §8), JSON in and out, and an ApiError carrying the server's
 *                 error code; a 401 or CSRF_INVALID tells the listeners that the game session ended.
 * Depends on:     nothing
 * Used by:        ./session, ./useMaintenance, ./DevTools, ../quicktest/*, ../game/*, ../host/*,
 *                 ../account/accountText, ../account/AccountPage, ../league/LeaderboardPage,
 *                 ../league/useApiGet, ../api
 * Spec:           docs/spec/05-api-design.md §1; docs/spec/03-security-architecture.md §8
 */

// Where the client is served: "/" standalone, "/games/bingo/" inside the website. The page
// routes with the URL hash, so the folder of its address is the base (09 §1).
export function basePathOf(pageUrl: string): string {
  return new URL('.', pageUrl).pathname;
}

export const BASE_PATH = typeof document === 'undefined' ? '/' : basePathOf(document.baseURI);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    // The server's detail when it gives one (e.g. PASSWORD_WEAK: tooShort, tooCommon).
    readonly reason: string | null = null,
  ) {
    super(`${String(status)} ${code}`);
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

// Who hears that the game session ended under a page that was signed in (a 401 here, or the
// socket's UNAUTHORIZED): website mode signs in again through the website (../account).
const sessionLost = new Set<() => void>();

export function onSessionLost(listener: () => void): () => void {
  sessionLost.add(listener);
  return () => {
    sessionLost.delete(listener);
  };
}

// No session any more: a 401, or for a change the CSRF check, which runs first and finds no
// session token to compare with.
const sessionEnded = (status: number, code: string | undefined): boolean =>
  status === 401 || code === 'CSRF_INVALID';

export function reportSessionLost(): void {
  for (const listener of sessionLost) listener();
}

export async function api<T>(
  path: string,
  options: { readonly method?: string; readonly body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken !== null) headers['x-csrf-token'] = csrfToken;
  const response = await fetch(`${BASE_PATH}api/v1${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as { code?: string; reason?: string };
  if (sessionEnded(response.status, body.code)) reportSessionLost();
  if (!response.ok) throw new ApiError(response.status, body.code ?? 'ERROR', body.reason ?? null);
  return body as T;
}
