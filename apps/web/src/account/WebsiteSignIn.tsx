/**
 * @file   apps/web/src/account/WebsiteSignIn.tsx
 * @module web/account
 * @brief  How a visitor signs in: the game's own forms, or only the website login (D37).
 *
 * Responsibility: the top bar's buttons for a visitor who is not signed in: "Sign in" and
 *                 "Register" (local mode), or one "Sign in" that opens the server's website
 *                 sign-in route with this page as the return path (website mode; the website's
 *                 proxy sends a visitor who is not signed in to the website's login and back).
 *                 In website mode the sign-in and register pages show that same link instead
 *                 of the forms. The server says the mode (GET /session `authMode`,
 *                 `signInPath`).
 * Depends on:     react, ../shell/router, ../shell/session, ./SignIn, ./Register
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/07-integration-architecture.md §2.3; docs/spec/03-security-architecture.md §2.2
 */
import type { ReactElement } from 'react';

import { hrefOf } from '../shell/router.js';
import { useSession } from '../shell/session.js';
import { Register } from './Register.js';
import { SignIn } from './SignIn.js';

// "/games/bingo/auth/website?next=%2Fgames%2Fbingo%2F%23%2Fmatch%2FX": back to this page.
export function websiteSignInHref(signInPath: string, hash: string): string {
  const base = signInPath.replace(/auth\/website$/, '');
  return `${signInPath}?next=${encodeURIComponent(`${base}${hash === '' ? '#/' : hash}`)}`;
}

// The website's sign-in route when the server runs in website mode, else null.
function useWebsiteSignIn(): string | null {
  const session = useSession().session;
  if (session?.authMode !== 'website' || session.signInPath === undefined) return null;
  return websiteSignInHref(session.signInPath, window.location.hash);
}

export function SignInLinks(): ReactElement {
  const website = useWebsiteSignIn();
  if (website !== null) {
    return (
      <a className="sbr-btn sbr-btn--primary" href={website} data-testid="open-sign-in">
        Sign in
      </a>
    );
  }
  return (
    <>
      <a
        className="sbr-btn sbr-btn--primary"
        href={hrefOf({ name: 'signIn' })}
        data-testid="open-sign-in"
      >
        Sign in
      </a>
      <a className="sbr-btn" href={hrefOf({ name: 'register' })} data-testid="open-register">
        Register
      </a>
    </>
  );
}

// The sign-in or register page: the forms, or in website mode the website's login.
export function SignInPage({ register }: { readonly register: boolean }): ReactElement {
  const website = useWebsiteSignIn();
  if (website === null) return register ? <Register /> : <SignIn />;
  return (
    <section className="sbr-panel sbr-stack" data-testid="website-sign-in">
      <h1>Sign in</h1>
      <p>Players sign in with their Seasonal Entertainment account.</p>
      <p>
        <a className="sbr-btn sbr-btn--primary" href={website}>
          Sign in on the website
        </a>
      </p>
    </section>
  );
}
