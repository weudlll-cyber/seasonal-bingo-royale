/**
 * @file   e2e/fromThisSite.ts
 * @module e2e
 * @brief  What a browser says about a write from the game's own pages, for the specs' API calls.
 *
 * Responsibility: the server refuses a write that does not name where it comes from (the kit's
 *                 `writeCheck`, 03 §8). A browser sends `Sec-Fetch-Site` itself; Playwright's API
 *                 requests do not, so the specs' own writes send what the browser would.
 * Used by:        the specs and helpers that post to the game's API
 * Spec:           docs/spec/03-security-architecture.md §8
 */
export const FROM_THIS_SITE = { 'sec-fetch-site': 'same-origin' } as const;
