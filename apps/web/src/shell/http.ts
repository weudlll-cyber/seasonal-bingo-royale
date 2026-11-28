/**
 * @file   apps/web/src/shell/http.ts
 * @module web/shell
 * @brief  JSON calls to the server's /api/v1 with the session cookie and CSRF token.
 *
 * Responsibility: the kit's client (`createApiClient`, K70) for the real game, relative to where
 *                 the client is served (BASE_PATH: "/" standalone, "/games/bingo/" inside the
 *                 website, 09 §1): the session's CSRF token on every state-changing call (03 §8),
 *                 every failure an `ApiError` with the server's code (no answer at all: status 0,
 *                 `NO_ANSWER`); a 401 or CSRF_INVALID tells the listeners that the game session
 *                 ended.
 * Depends on:     @seasonal/kit (createApiClient, ApiError, basePathOf)
 * Used by:        ./session, ./useMaintenance, ./DevTools, ../quicktest/*, ../game/*, ../host/*,
 *                 ../account/*, ../admin/*, ../league/*, ../api
 * Spec:           docs/spec/05-api-design.md §1; docs/spec/03-security-architecture.md §8
 */
import { ApiError, basePathOf, createApiClient } from '@seasonal/kit';

export { ApiError };

export const BASE_PATH = typeof document === 'undefined' ? '/' : basePathOf(document.baseURI);

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

export function reportSessionLost(): void {
  for (const listener of sessionLost) listener();
}

export const api = createApiClient({
  basePath: BASE_PATH,
  csrf: () => csrfToken,
  // No session any more: a 401, or for a change the CSRF check, which runs first and finds no
  // session token to compare with. The call still ends with its error.
  onAnswer: (response, code) => {
    if (response.status === 401 || code === 'CSRF_INVALID') reportSessionLost();
    return false;
  },
});
