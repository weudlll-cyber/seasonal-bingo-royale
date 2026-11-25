/**
 * @file   apps/web/src/shell/AppShell.tsx
 * @module web/shell
 * @brief  The player client's frame: the top bar, then the current route's screen.
 *
 * Responsibility: the top bar (./Header: the kit's header with Bingo's links and account);
 *                 below it the current route's screen (boards and profiles: ../league); in
 *                 maintenance (./useMaintenance, shared as its context) the lobby and create
 *                 form show the maintenance page, the host console a banner (09 §4); "Verify
 *                 this match" after a match (../game/VerifyMatch); in website mode the lobby,
 *                 match and console sit in the website's chat dock (./DockedChat). The dev-only
 *                 Quick Test (../App) loads on demand, out of production builds.
 * Depends on:     react, ./Header, ./router, ./session, ./Maintenance, ./useMaintenance,
 *                 ./DockedChat, ../App (lazy, development only), ../admin/AdminArea, ../game/*,
 *                 ../host/*, ../account/*, ../league/*, ./shell.css
 * Used by:        ../main
 * Spec:           docs/spec/01-game-design.md §10, §13; docs/spec/05-api-design.md §2.1, §2.2, §2.4
 */
import { lazy, Suspense, type ReactElement } from 'react';

import { AdminArea } from '../admin/AdminArea.js';
import { AccountPage } from '../account/AccountPage.js';
import { ForgotPassword, ResetPassword } from '../account/PasswordReset.js';
import { TwoFactorPage } from '../account/TwoFactor.js';
import { SignInPage, useWebsiteResign } from '../account/WebsiteSignIn.js';
import { Lobby } from '../game/Lobby.js';
import { MatchScreen } from '../game/MatchScreen.js';
import { VerifyMatch } from '../game/VerifyMatch.js';
import { StartMatch } from '../host/StartMatch.js';
import { HostConsole } from '../host/HostConsole.js';
import { LeaderboardPage } from '../league/LeaderboardPage.js';
import { ProfilePage } from '../league/ProfilePage.js';
import { DockedChat, useChatPlace } from './DockedChat.js';
import { Header } from './Header.js';
import { useRoute, type QuickTestView, type Route } from './router.js';
import { MaintenanceBanner, MaintenancePage } from './Maintenance.js';
import { useSession } from './session.js';
import { MaintenanceContext, useMaintenance, type MaintenanceState } from './useMaintenance.js';
import './shell.css';

// The Quick Test loads on demand. A production build replaces import.meta.env.DEV with false,
// so this import and everything behind it stay out of the bundle (audit B).
const QuickTest = import.meta.env.DEV
  ? lazy(() => import('../App.js').then((m) => ({ default: m.App })))
  : null;

export function AppShell({ dev }: { readonly dev: boolean }): ReactElement {
  const route = useRoute();
  const maintenance = useMaintenance();
  // Website mode: the website's chat docked under the lobby, the match screens and the console.
  const chat = useChatPlace(route);
  // Website mode: an ended game session signs in again through the website (an idle admin).
  useWebsiteResign();
  const screen = <MaintainedScreen route={route} dev={dev} maintenance={maintenance} />;
  return (
    <MaintenanceContext.Provider value={maintenance}>
      <Header route={route} dev={dev} />
      <main className="shell-main">
        {chat === null ? screen : <DockedChat place={chat}>{screen}</DockedChat>}
      </main>
    </MaintenanceContext.Provider>
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
  const session = useSession().session;
  const who = session?.account?.id ?? 'guest';
  // A local admin's second sign-in step comes before every screen (D60).
  if (session?.twoFactor) return <TwoFactorPage step={session.twoFactor} />;
  switch (route.name) {
    case 'lobby':
      return <Lobby />;
    case 'match':
      return <MatchScreen key={`${route.code}-${who}`} code={route.code} />;
    case 'hostNew':
      return <StartMatch />;
    case 'host':
      return <HostConsole key={`${route.code}-${who}`} code={route.code} />;
    case 'verify':
      return <VerifyMatch key={route.code} code={route.code} />;
    case 'quicktest':
      return <QuickTestScreen dev={dev} view={route.view} />;
    default:
      return <AccountScreen route={route} />;
  }
}

type AccountRoute = Extract<
  Route,
  {
    readonly name:
      | 'signIn'
      | 'register'
      | 'forgotPassword'
      | 'resetPassword'
      | 'account'
      | 'leaderboard'
      | 'player'
      | 'admin';
  }
>;

// The screens around the player: sign-in, register, account, leaderboard and profiles; the
// admin area's Overview.
function AccountScreen({ route }: { readonly route: AccountRoute }): ReactElement {
  switch (route.name) {
    case 'signIn':
      return <SignInPage register={false} />;
    case 'register':
      return <SignInPage register />;
    case 'forgotPassword':
      return <ForgotPassword />;
    case 'resetPassword':
      return <ResetPassword />;
    case 'account':
      return <AccountPage />;
    case 'leaderboard':
      return <LeaderboardPage periodId={route.periodId} />;
    case 'player':
      return <ProfilePage key={route.displayName} displayName={route.displayName} />;
    case 'admin':
      return <AdminArea section={route.section} />;
  }
}

// The Quick Test calls a development-only server route; production shows the lobby.
function QuickTestScreen({
  dev,
  view,
}: {
  readonly dev: boolean;
  readonly view: QuickTestView | undefined;
}): ReactElement {
  if (!dev || QuickTest === null) return <Lobby />;
  return (
    <Suspense fallback={null}>
      <QuickTest view={view} />
    </Suspense>
  );
}
