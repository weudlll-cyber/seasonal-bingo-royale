/**
 * @file   packages/contracts/src/http/steps.ts
 * @module contracts/http
 * @brief  A member's Discord steps from the website (2026-11-04): the shape the views carry.
 *
 * Responsibility: `Step` is one ladder's highest step as the screens show it next to a name
 *                 (holder, farmer, investor; at most three; the icon a path on the website's own
 *                 origin or null). The website's X-Acting-User-Steps header is checked by
 *                 @seasonal/kit/server (`identityFrom`, apps/server/src/http/routes/websiteSignIn)
 *                 and gives this same shape.
 * Depends on:     nothing
 * Used by:        ../index, the views that carry steps
 * Spec:           docs/spec/07-integration-architecture.md §2.3; docs/concepts/kit-adoption.md §2 (B4)
 */

export interface Step {
  readonly ladder: 'holder' | 'farmer' | 'investor';
  readonly name: string;
  readonly icon: string | null;
}
