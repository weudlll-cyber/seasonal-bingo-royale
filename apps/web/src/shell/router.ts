/**
 * @file   apps/web/src/shell/router.ts
 * @module web/shell
 * @brief  Hash routes of the player client: lobby, match, host screens, verify, Quick Test, account, boards.
 *         The Quick Test has a chooser and one sub-route per way to test (play, seed).
 *
 * Responsibility: parse `location.hash` into a route and back, and a hook that follows
 *                 hash changes. Hash routing keeps every screen reachable from the dev
 *                 server and from a static host without server rewrites. Sign-in, register,
 *                 the account page, the leaderboard (optionally one period) and a player's
 *                 profile (the display name URL-encoded) are routes too.
 * Depends on:     react
 * Used by:        ./AppShell, the screens that link to each other, ../App, ../quicktest/*, ../account/Register,
 *                 ../account/SignIn, ../account/formParts, ../game/EndActions,
 *                 ../game/HostLink, ../game/Lobby, ../host/CreateMatch, ../host/HostConsole,
 *                 ../host/YourMatches, ./DevTools, ../game/VerifyMatch, ../league/LeaderboardPage,
 *                 ../league/ProfilePage, ../league/playerHref, ../account/AccountPage
 * Spec:           docs/spec/01-game-design.md §10, §13; docs/spec/15-implementation-plan.md WP-12, WP-15
 */
import { useEffect, useState } from 'react';

// The test page's chooser (no view), a test match to play, or the seed check.
export type QuickTestView = 'play' | 'seed';

export type Route =
  | { readonly name: 'lobby' }
  | { readonly name: 'match'; readonly code: string }
  | { readonly name: 'hostNew' }
  | { readonly name: 'host'; readonly code: string }
  | { readonly name: 'verify'; readonly code: string }
  | { readonly name: 'quicktest'; readonly view?: QuickTestView }
  | { readonly name: 'signIn' }
  | { readonly name: 'register' }
  | { readonly name: 'forgotPassword' }
  | { readonly name: 'resetPassword' }
  | { readonly name: 'account' }
  | { readonly name: 'leaderboard'; readonly periodId: string | null }
  | { readonly name: 'player'; readonly displayName: string };

// Routes without a parameter (a trailing segment is ignored).
const PLAIN: Readonly<Record<string, Route>> = {
  quicktest: { name: 'quicktest' },
  'sign-in': { name: 'signIn' },
  register: { name: 'register' },
  'forgot-password': { name: 'forgotPassword' },
  // The link in the reset e-mail carries its token as a query: #/reset-password?token=…
  'reset-password': { name: 'resetPassword' },
  account: { name: 'account' },
  leaderboard: { name: 'leaderboard', periodId: null },
};

export function parseRoute(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter((p) => p.length > 0);
  const [segment = '', second] = parts;
  const first = segment.split('?')[0] ?? '';
  const plain = PLAIN[first] ?? { name: 'lobby' };
  return second === undefined ? plain : (withParameter(first, second) ?? plain);
}

function withParameter(first: string, second: string): Route | null {
  switch (first) {
    case 'match':
      return { name: 'match', code: second };
    case 'host':
      return second === 'new' ? { name: 'hostNew' } : { name: 'host', code: second };
    case 'verify':
      return { name: 'verify', code: second };
    case 'quicktest':
      return quickTestRoute(second);
    case 'leaderboard':
      return { name: 'leaderboard', periodId: second };
    case 'players':
      return playerRoute(second);
    default:
      return null;
  }
}

// The chooser, or one of its sub-routes; anything else after it is the chooser.
function quickTestRoute(view: string): Route {
  return view === 'play' || view === 'seed' ? { name: 'quicktest', view } : { name: 'quicktest' };
}

// A malformed escape in a typed-in address leads to the lobby instead of an error.
function playerRoute(encoded: string): Route | null {
  try {
    return { name: 'player', displayName: decodeURIComponent(encoded) };
  } catch {
    return null;
  }
}

// The address of every route without a parameter.
const PLAIN_HREFS: Readonly<
  Record<
    'lobby' | 'hostNew' | 'signIn' | 'register' | 'forgotPassword' | 'resetPassword' | 'account',
    string
  >
> = {
  lobby: '#/',
  hostNew: '#/host/new',
  signIn: '#/sign-in',
  register: '#/register',
  forgotPassword: '#/forgot-password',
  resetPassword: '#/reset-password',
  account: '#/account',
};

export function hrefOf(route: Route): string {
  switch (route.name) {
    case 'match':
      return `#/match/${route.code}`;
    case 'host':
      return `#/host/${route.code}`;
    case 'verify':
      return `#/verify/${route.code}`;
    case 'quicktest':
      return route.view === undefined ? '#/quicktest' : `#/quicktest/${route.view}`;
    case 'leaderboard':
      return route.periodId === null ? '#/leaderboard' : `#/leaderboard/${route.periodId}`;
    case 'player':
      return `#/players/${encodeURIComponent(route.displayName)}`;
    default:
      return PLAIN_HREFS[route.name];
  }
}

export function navigate(route: Route): void {
  window.location.hash = hrefOf(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = (): void => {
      setRoute(parseRoute(window.location.hash));
    };
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
    };
  }, []);
  return route;
}
