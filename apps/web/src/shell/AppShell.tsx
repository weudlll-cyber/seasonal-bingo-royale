/**
 * @file   apps/web/src/shell/AppShell.tsx
 * @module web/shell
 * @brief  The player client's frame: top bar, navigation, account, screens.
 *
 * Responsibility: emblem, wordmark, light/dark toggle, links to the lobby, hosting (with
 *                 `match.create`) and the leaderboard; the account: the chip "Signed in as
 *                 <name> (host|player)" opens the account page, sign-out, or "Sign in" and
 *                 "Register" (../account). Below the bar the current route's screen (boards and
 *                 profiles: ../league); in maintenance (./useMaintenance) the lobby and create
 *                 form show the maintenance page, the host console a banner (09 §4); "Verify this
 *                 match" after a match (../game/VerifyMatch). Dev-only Quick Test and "Dev
 *                 sign-in" (./DevTools) load on demand and stay out of production builds.
 * Depends on:     react, ./router, ./session, ./ThemeToggle, ./Maintenance, ./useMaintenance,
 *                 ./DevTools and ../App (lazy,
 *                 development only), ../game/*, ../host/*, ../account/*, ../league/*, ./shell.css,
 *                 assets/brand/emblem.webp
 * Used by:        ../main
 * Spec:           docs/spec/01-game-design.md §10, §13; docs/spec/05-api-design.md §2.1, §2.2, §2.4
 */
import { lazy, Suspense, type ReactElement } from 'react';

import emblem from '../../../../assets/brand/emblem.webp';
import { AccountPage } from '../account/AccountPage.js';
import { Register } from '../account/Register.js';
import { SignIn } from '../account/SignIn.js';
import { Lobby } from '../game/Lobby.js';
import { MatchScreen } from '../game/MatchScreen.js';
import { VerifyMatch } from '../game/VerifyMatch.js';
import { CreateMatch } from '../host/CreateMatch.js';
import { HostConsole } from '../host/HostConsole.js';
import { LeaderboardPage } from '../league/LeaderboardPage.js';
import { ProfilePage } from '../league/ProfilePage.js';
import { hrefOf, useRoute, type Route } from './router.js';
import { MaintenanceBanner, MaintenancePage } from './Maintenance.js';
import { useSession } from './session.js';
import { ThemeToggle } from './ThemeToggle.js';
import { useMaintenance, type MaintenanceState } from './useMaintenance.js';
import './shell.css';

// Development tools load on demand. A production build replaces import.meta.env.DEV with
// false, so these imports and everything behind them stay out of the bundle (audit B).
const QuickTestLink = import.meta.env.DEV
  ? lazy(() => import('./DevTools.js').then((m) => ({ default: m.QuickTestLink })))
  : null;
const DevSignIn = import.meta.env.DEV
  ? lazy(() => import('./DevTools.js').then((m) => ({ default: m.DevSignIn })))
  : null;
const QuickTest = import.meta.env.DEV
  ? lazy(() => import('../App.js').then((m) => ({ default: m.App })))
  : null;

export function AppShell({ dev }: { readonly dev: boolean }): ReactElement {
  const route = useRoute();
  const maintenance = useMaintenance();
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
        <MaintainedScreen route={route} dev={dev} maintenance={maintenance} />
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
      {link(
        { name: 'lobby' },
        'Play',
        route.name === 'lobby' || route.name === 'match' || route.name === 'verify',
      )}
      {can('match.create')
        ? link(
            { name: 'hostNew' },
            'Host a match',
            route.name === 'hostNew' || route.name === 'host',
          )
        : null}
      {link(
        { name: 'leaderboard', periodId: null },
        'Leaderboard',
        route.name === 'leaderboard' || route.name === 'player',
      )}
      {dev && QuickTestLink !== null ? (
        <Suspense fallback={null}>
          <QuickTestLink active={route.name === 'quicktest'} />
        </Suspense>
      ) : null}
    </nav>
  );
}

function Account({ dev }: { readonly dev: boolean }): ReactElement {
  const { session, signOut, can } = useSession();
  return (
    <div className="shell-account" data-testid="account">
      {session?.account ? (
        <>
          {/* The chip opens the account page (data download, deletion). */}
          <a
            className="sbr-chip shell-account-link"
            href={hrefOf({ name: 'account' })}
            data-testid="signed-in-as"
          >
            <span className="chip-prefix">Signed in as </span>
            {session.account.displayName} ({can('match.create') ? 'host' : 'player'})
          </a>
          <button
            type="button"
            className="sbr-btn"
            data-testid="sign-out"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </>
      ) : null}
      {session !== null && session.account === null ? (
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
      ) : null}
      {dev && DevSignIn !== null ? (
        <Suspense fallback={null}>
          <DevSignIn />
        </Suspense>
      ) : null}
    </div>
  );
}

// Keyed by match code and account: a new match, or a sign-in as someone else, mounts the
// screen fresh, so nothing of the previous match or session survives (fresh-state rule).
interface ScreenProps {
  readonly route: Route;
  readonly dev: boolean;
  readonly maintenance: MaintenanceState | null;
}

// Maintenance (09 §4): the lobby and the create form give way to the maintenance page;
// running matches and their screens go on, the host console with a banner.
function MaintainedScreen({ route, dev, maintenance }: ScreenProps): ReactElement {
  if (maintenance?.on !== true) return <Screen route={route} dev={dev} />;
  if (route.name === 'lobby' || route.name === 'hostNew') {
    return <MaintenancePage state={maintenance} />;
  }
  return (
    <>
      {route.name === 'host' ? <MaintenanceBanner state={maintenance} /> : null}
      <Screen route={route} dev={dev} />
    </>
  );
}

function Screen({ route, dev }: { readonly route: Route; readonly dev: boolean }): ReactElement {
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
    case 'verify':
      return <VerifyMatch key={route.code} code={route.code} />;
    case 'quicktest':
      return <QuickTestScreen dev={dev} />;
    default:
      return <AccountScreen route={route} />;
  }
}

type AccountRoute = Extract<
  Route,
  { readonly name: 'signIn' | 'register' | 'account' | 'leaderboard' | 'player' }
>;

// The screens around the player: sign-in, register, account, leaderboard and profiles.
function AccountScreen({ route }: { readonly route: AccountRoute }): ReactElement {
  switch (route.name) {
    case 'signIn':
      return <SignIn />;
    case 'register':
      return <Register />;
    case 'account':
      return <AccountPage />;
    case 'leaderboard':
      return <LeaderboardPage periodId={route.periodId} />;
    case 'player':
      return <ProfilePage key={route.displayName} displayName={route.displayName} />;
  }
}

// The Quick Test calls a development-only server route; production shows the lobby.
function QuickTestScreen({ dev }: { readonly dev: boolean }): ReactElement {
  if (!dev || QuickTest === null) return <Lobby />;
  return (
    <Suspense fallback={null}>
      <QuickTest />
    </Suspense>
  );
}
