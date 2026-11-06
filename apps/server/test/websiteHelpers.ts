/**
 * @file   apps/server/test/websiteHelpers.ts
 * @module server/test
 * @brief  Website mode test helpers: the settings, the proxy's sign-in request, the session.
 *
 * Responsibility: the website-mode settings under /games/bingo/ (the test runner's address as
 *                 the trusted proxy, a proxy secret), the identity headers of a visitor (with
 *                 may-host and steps),
 *                 the proxy's request for GET <base>auth/website (peer, `next` and the proxy
 *                 secret adjustable), the session cookie of a response and GET /session.
 * Depends on:     fastify (types), ../src/index (types)
 * Used by:        ./websiteLogin.integration.test, ./websiteRules.integration.test
 * Spec:           docs/spec/07-integration-architecture.md §2.3
 */
import type { LightMyRequestResponse } from 'fastify';

import type { App } from '../src/index.js';

export const BASE = '/games/bingo/';
export const SECRET = '5e'.repeat(32);
export const WEBSITE = {
  SBR_DEV: '0',
  SBR_AUTH_MODE: 'website',
  SBR_BASE_PATH: BASE,
  SBR_PUBLIC_URL: `https://example.org${BASE}`,
  SBR_TRUSTED_PROXIES: '127.0.0.1',
  SBR_WEBSITE_PROXY_SECRET: SECRET,
};

export interface Visitor {
  readonly id: string;
  readonly name: string;
  readonly roles?: string;
  readonly verified?: 'true' | 'false';
  // X-Acting-User-Can-Host and X-Acting-User-Steps as the website sends them.
  readonly canHost?: 'true' | 'false';
  readonly steps?: string;
}

export const headersOf = (v: Visitor) => ({
  'x-acting-user-id': v.id,
  'x-acting-user': v.name,
  'x-acting-user-roles': v.roles ?? 'member',
  'x-acting-user-email-verified': v.verified ?? 'false',
  'x-acting-user-can-host': v.canHost ?? 'false',
  ...(v.steps === undefined ? {} : { 'x-acting-user-steps': v.steps }),
});

interface Via {
  readonly peer?: string;
  readonly next?: string;
  // The proxy secret header's value; null leaves the header out.
  readonly secret?: string | null;
}

// The proxy's request for the sign-in route.
export function signInAs(app: App, v: Visitor, via: Via = {}) {
  const { peer = '127.0.0.1', next = `${BASE}#/`, secret = SECRET } = via;
  return app.fastify.inject({
    method: 'GET',
    url: `${BASE}auth/website?next=${encodeURIComponent(next)}`,
    headers: { ...headersOf(v), ...(secret === null ? {} : { 'x-sbr-proxy-secret': secret }) },
    remoteAddress: peer,
  });
}

export const cookieOf = (r: LightMyRequestResponse): string | null => {
  const c = r.cookies.find((x) => x.name.endsWith('sbr_session'));
  return c === undefined ? null : `${c.name}=${c.value}`;
};

export interface SessionView {
  readonly signedIn: boolean;
  readonly account: { readonly id: string; readonly displayName: string } | null;
  readonly permissions: readonly string[];
  readonly csrfToken: string | null;
  readonly authMode: string;
  readonly signInPath?: string;
  readonly chat?: { readonly path: string; readonly room: string };
}

export async function sessionOf(
  app: App,
  cookie: string | null,
  extra: Record<string, string> = {},
  base = BASE,
): Promise<SessionView> {
  const r = await app.fastify.inject({
    method: 'GET',
    url: `${base}api/v1/session`,
    headers: { ...(cookie === null ? {} : { cookie }), ...extra },
  });
  return r.json<SessionView>();
}
