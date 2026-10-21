/**
 * @file   apps/web/src/shell/AppShell.tsx
 * @module web/shell
 * @brief  The player client's frame: top bar, navigation, account, dev quick sign-in, screens.
 *
 * Responsibility: show the Seasonal Entertainment emblem with the "Seasonal Bingo Royale"
 *                 wordmark, the light/dark toggle, links to the lobby, hosting (with
 *                 `match.create`) and the Quick Test (development only), the account with
 *                 sign-out ("Signed in as <name> (host|player)"), and in development a compact
 *                 "Dev sign-in" menu with "Sign in as host" / "Sign in as player 1/2/3" and a
 *                 hint that one window holds one sign-in (05 §2.1). Below the bar, the screen of the
 *                 current route. `dev` decides the development-only parts; production builds
 *                 pass false.
 * Depends on:     react, ./router, ./session, ./ThemeToggle, ../game/*, ../host/*, ../App,
 *                 ./shell.css, assets/brand/emblem.webp
 * Used by:        ../main
 * Spec:           docs/spec/01-game-design.md §13; docs/spec/05-api-design.md §2.1
 */
import { useState, type ReactElement } from 'react';

import emblem from '../../../../assets/brand/emblem.webp';
import { App as QuickTest } from '../App.js';
import { Lobby } from '../game/Lobby.js';
import { MatchScreen } from '../game/MatchScreen.js';
import { CreateMatch } from '../host/CreateMatch.js';
import { HostConsole } from '../host/HostConsole.js';
import { hrefOf, useRoute, type Route } from './router.js';
import { useSession, type DevIdentity } from './session.js';
import { ThemeToggle } from './ThemeToggle.js';
import './shell.css';

const DEV_IDENTITIES: readonly { readonly as: DevIdentity; readonly label: string }[] = [
  { as: 'host', label: 'Sign in as host' },
  { as: 'player-1', label: 'Sign in as player 1' },
  { as: 'player-2', label: 'Sign in as player 2' },
  { as: 'player-3', label: 'Sign in as player 3' },
];

export function AppShell({ dev }: { readonly dev: boolean }): ReactElement {
  const route = useRoute();
  return (
    <>
      <header className="shell-bar">
        <a className="shell-brand" href={hrefOf({ name: 'lobby' })}>
          <img src={emblem} alt="" width="42" height="37" />
          <span>
            Seasonal Bingo Royale
            <small>Seasonal Entertainment</small>
          </span>
        </a>
        {/* Beside the account on wide screens, beside the brand on phones (shell.css). */}
        <ThemeToggle />
        <Nav route={route} dev={dev} />
        <Account dev={dev} />
      </header>
      <main className="shell-main">
        <Screen route={route} />
      </main>
    </>
  );
}

function Nav({ route, dev }: { readonly route: Route; readonly dev: boolean }): ReactElement {
  const { can } = useSession();
  const link = (to: Route, label: string, active: boolean) => (
    <a href={hrefOf(to)} aria-current={active ? 'page' : undefined}>
      {label}
    </a>
  );
  return (
    <nav className="shell-nav" aria-label="Main">
      {link({ name: 'lobby' }, 'Play', route.name === 'lobby' || route.name === 'match')}
      {can('match.create')
        ? link(
            { name: 'hostNew' },
            'Host a match',
            route.name === 'hostNew' || route.name === 'host',
          )
        : null}
      {dev ? link({ name: 'quicktest' }, 'Quick Test', route.name === 'quicktest') : null}
    </nav>
  );
}

function Account({ dev }: { readonly dev: boolean }): ReactElement {
  const { session, signOut, can } = useSession();
  return (
    <div className="shell-account" data-testid="account">
      {session?.account ? (
        <>
          <span className="sbr-chip" data-testid="signed-in-as">
            <span className="chip-prefix">Signed in as </span>
            {session.account.displayName} ({can('match.create') ? 'host' : 'player'})
          </span>
          <button type="button" className="sbr-btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </>
      ) : null}
      {dev ? <DevSignIn /> : null}
    </div>
  );
}

// Development only: one compact menu instead of four buttons in the bar.
function DevSignIn(): ReactElement {
  const { devSignIn } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <div className="dev-menu">
      <button
        type="button"
        className="sbr-btn"
        aria-expanded={open}
        data-testid="dev-menu"
        onClick={() => {
          setOpen(!open);
        }}
      >
        Dev sign-in
      </button>
      {open ? (
        <div className="dev-menu-panel sbr-panel" role="menu">
          {DEV_IDENTITIES.map((d) => (
            <button
              key={d.as}
              type="button"
              role="menuitem"
              className="sbr-btn"
              data-testid={`dev-sign-in-${d.as}`}
              onClick={() => {
                setOpen(false);
                void devSignIn(d.as);
              }}
            >
              {d.label}
            </button>
          ))}
          <p className="sbr-muted dev-menu-hint">
            One window holds one sign-in — use a private window or another browser for a second
            person.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// Keyed by match code and account: a new match, or a sign-in as someone else, mounts the
// screen fresh, so nothing of the previous match or session survives (fresh-state rule).
function Screen({ route }: { readonly route: Route }): ReactElement {
  const who = useSession().session?.account?.id ?? 'guest';
  switch (route.name) {
    case 'lobby':
      return <Lobby />;
    case 'match':
      return <MatchScreen key={`${route.code}-${who}`} code={route.code} />;
    case 'hostNew':
      return <CreateMatch />;
    case 'host':
      return <HostConsole key={`${route.code}-${who}`} code={route.code} />;
    case 'quicktest':
      return <QuickTest />;
  }
}
