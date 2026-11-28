/**
 * @file   apps/web/src/account/WebsiteSignIn.tsx
 * @module web/account
 * @brief  How a visitor signs in: the game's own forms, or only the website login (D37).
 *
 * Responsibility: where the top bar's "Sign in" leads in website mode (`useWebsiteSignIn`): the
 *                 website's login via the server's <base>auth/website/login with this page as
 *                 return path; null in local mode (kit header has "Sign in" and "Register",
 *                 ../shell/Header). Website mode: the sign-in and register pages show that link
 *                 instead of forms; `useSignInToPlay` gives it to Join screens for visitors.
 *                 `useWebsiteResign`: a game session ending under a signed-in page (an idle
 *                 admin's) goes through the sign-in route with this page as `next`. The server
 *                 says the mode (GET /session `authMode`, `signInPath`).
 * Depends on:     react, ../shell/http, ../shell/router, ../shell/session, ./SignIn, ./Register
 * Used by:        ../shell/Header, ../shell/AppShell, ../game/Lobby, ../game/WaitingRoom, ./AccountPage
 * Spec:           docs/spec/07-integration-architecture.md §2.3; docs/spec/03-security-architecture.md §2.2
 */
import { useEffect, type ReactElement } from 'react';

import { onSessionLost } from '../shell/http.js';
import { useSession } from '../shell/session.js';
import { Register } from './Register.js';
import { SignIn } from './SignIn.js';

// "/games/bingo/auth/website/login?next=%2Fgames%2Fbingo%2F%23%2Fmatch%2FX": the website's
// login, then through the sign-in route back to this page (D43).
export function websiteSignInHref(signInPath: string, hash: string): string {
  const base = signInPath.replace(/auth\/website$/, '');
  return `${signInPath}/login?next=${encodeURIComponent(`${base}${hash === '' ? '#/' : hash}`)}`;
}

// Leaving the page (a seam for the tests: jsdom does not navigate).
export const leavePage = {
  to(url: string): void {
    window.location.assign(url);
  },
};

// Website mode: a game session that ends under a signed-in page (an admin's idles out after
// 30 minutes) is signed in again through the website's sign-in route straight away. The website
// knows the player: back on this page, signed in, no login form; it does not: its login, as
// for "Sign in"; it answers guest (locked): this page as a guest.
export function useWebsiteResign(): void {
  const session = useSession().session;
  const path =
    session?.signedIn === true && session.authMode === 'website' ? session.signInPath : undefined;
  useEffect(() => {
    if (path === undefined) return undefined;
    return onSessionLost(() => {
      const base = path.replace(/auth\/website$/, '');
      const hash = window.location.hash === '' ? '#/' : window.location.hash;
      leavePage.to(`${path}?next=${encodeURIComponent(`${base}${hash}`)}`);
    });
  }, [path]);
}

// The website's sign-in route when the server runs in website mode, else null.
export function useWebsiteSignIn(): string | null {
  const session = useSession().session;
  if (session?.authMode !== 'website' || session.signInPath === undefined) return null;
  return websiteSignInHref(session.signInPath, window.location.hash);
}

// Where a visitor without an account goes to play in website mode (join, host, own pages):
// the website login and back to this page; null when signed in or in local mode.
export function useSignInToPlay(): string | null {
  const website = useWebsiteSignIn();
  return useSession().session?.account == null ? website : null;
}

// The sign-in or register page: the forms, or in website mode the website's login.
export function SignInPage({ register }: { readonly register: boolean }): ReactElement {
  const website = useWebsiteSignIn();
  if (website === null) return register ? <Register /> : <SignIn />;
  return (
    <section className="sk-panel sbr-stack" data-testid="website-sign-in">
      <h1>Sign in</h1>
      <p>Players sign in with their Seasonal Entertainment account.</p>
      <p>
        <a className="sk-btn sk-btn--primary" href={website}>
          Sign in on the website
        </a>
      </p>
    </section>
  );
}
