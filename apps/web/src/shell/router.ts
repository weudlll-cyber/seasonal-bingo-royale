/**
 * @file   apps/web/src/shell/router.ts
 * @module web/shell
 * @brief  Hash routes of the player client: lobby, match, host screens, verify, Quick Test, sign-in, register.
 *
 * Responsibility: parse `location.hash` into a route and back, and a hook that follows
 *                 hash changes. Hash routing keeps every screen reachable from the dev
 *                 server and from a static host without server rewrites.
 * Depends on:     react
 * Used by:        ./AppShell, the screens that link to each other, ../account/Register,
 *                 ../account/SignIn, ../account/formParts, ../game/EndActions,
 *                 ../game/HostLink, ../game/Lobby, ../host/CreateMatch, ../host/HostConsole,
 *                 ../host/YourMatches, ./DevTools, ../game/VerifyMatch
 * Spec:           docs/spec/01-game-design.md §13; docs/spec/15-implementation-plan.md WP-12
 */
import { useEffect, useState } from 'react';

export type Route =
  | { readonly name: 'lobby' }
  | { readonly name: 'match'; readonly code: string }
  | { readonly name: 'hostNew' }
  | { readonly name: 'host'; readonly code: string }
  | { readonly name: 'verify'; readonly code: string }
  | { readonly name: 'quicktest' }
  | { readonly name: 'signIn' }
  | { readonly name: 'register' };

export function parseRoute(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter((p) => p.length > 0);
  const [first, second] = parts;
  if (first === 'match' && second !== undefined) return { name: 'match', code: second };
  if (first === 'host' && second === 'new') return { name: 'hostNew' };
  if (first === 'host' && second !== undefined) return { name: 'host', code: second };
  if (first === 'verify' && second !== undefined) return { name: 'verify', code: second };
  if (first === 'quicktest') return { name: 'quicktest' };
  if (first === 'sign-in') return { name: 'signIn' };
  if (first === 'register') return { name: 'register' };
  return { name: 'lobby' };
}

export function hrefOf(route: Route): string {
  switch (route.name) {
    case 'lobby':
      return '#/';
    case 'match':
      return `#/match/${route.code}`;
    case 'hostNew':
      return '#/host/new';
    case 'host':
      return `#/host/${route.code}`;
    case 'verify':
      return `#/verify/${route.code}`;
    case 'quicktest':
      return '#/quicktest';
    case 'signIn':
      return '#/sign-in';
    case 'register':
      return '#/register';
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
