/**
 * @file   apps/web/src/shell/Header.tsx
 * @module web/shell
 * @brief  The player client's top bar: the kit's AppHeader with Bingo's links, account and tools.
 *
 * Responsibility: the kit's `AppHeader` (@seasonal/kit/react, folds below 960 px and where items
 *                 do not fit): in website mode first the kit's `BackLink` to the website's /games
 *                 (this tab), then emblem, wordmark, links (lobby, hosting `match.create`,
 *                 leaderboard, admin `admin.view`, dev Quick Test), account, theme toggle last (the
 *                 kit's order, K43). Account: chip
 *                 "Signed in as <name> (role)" with "Sign out", or "Sign in"/"Register"
 *                 (../account; website mode one "Sign in", D37); hidden until the session is known
 *                 (`data-session`, ./header.css). The folded menu closes on a new route or a
 *                 sign-in. The chat has no button here: it is docked under the game (./DockedChat).
 * Depends on:     react, @seasonal/kit/react (AppHeader), ./router, ./session,
 *                 ./DevTools (lazy, development only), ../account/WebsiteSignIn,
 *                 ./header.css, assets/brand/emblem.webp
 * Used by:        ./AppShell
 * Spec:           docs/spec/01-game-design.md §13; docs/spec/05-api-design.md §2.1, §2.4;
 *                 Seasonal Entertainment docs/GAME-INTEGRATION.md §8
 */
import { AppHeader, type HeaderAccount, type HeaderLink } from '@seasonal/kit/react';
import { lazy, Suspense, type ReactElement } from 'react';

import emblem from '../../../../assets/brand/emblem.webp';
import { useWebsiteSignIn } from '../account/WebsiteSignIn.js';
import { hrefOf, type Route } from './router.js';
import { highestRole, useSession } from './session.js';
import './header.css';

// Development tools load on demand. A production build replaces import.meta.env.DEV with
// false, so these imports and everything behind them stay out of the bundle (audit B).
const QuickTestLink = import.meta.env.DEV
  ? lazy(() => import('./DevTools.js').then((m) => ({ default: m.QuickTestLink })))
  : null;
const DevSignIn = import.meta.env.DEV
  ? lazy(() => import('./DevTools.js').then((m) => ({ default: m.DevSignIn })))
  : null;

interface HeaderProps {
  readonly route: Route;
  readonly dev: boolean;
}

// The bar's links; the server checks every call behind them.
function useLinks(route: Route): readonly HeaderLink[] {
  const { can } = useSession();
  const link = (to: Route, label: string, active: boolean): HeaderLink => ({
    href: hrefOf(to),
    label,
    active,
  });
  const on = (...names: readonly Route['name'][]) => names.includes(route.name);
  return [
    link({ name: 'lobby' }, 'Play', on('lobby', 'match', 'verify')),
    ...(can('match.create')
      ? [link({ name: 'hostNew' }, 'Host a match', on('hostNew', 'host'))]
      : []),
    link({ name: 'leaderboard', periodId: null }, 'Leaderboard', on('leaderboard', 'player')),
    // The admin area, for Admins only (admin-area §8 (a)).
    ...(can('admin.view') ? [link({ name: 'admin' }, 'Admin', on('admin'))] : []),
  ];
}

// The signed-in account as the header shows it, or null.
function useAccount(): HeaderAccount | null {
  const { session, signOut, can } = useSession();
  const account = session?.account ?? null;
  if (account === null) return null;
  return {
    name: account.displayName,
    role: highestRole(can),
    href: hrefOf({ name: 'account' }),
    onSignOut: () => void signOut(),
  };
}

// After the links: the development Quick Test link.
function NavExtra({ route, dev }: HeaderProps): ReactElement | null {
  if (!dev || QuickTestLink === null) return null;
  return (
    <Suspense fallback={null}>
      <QuickTestLink active={route.name === 'quicktest'} />
    </Suspense>
  );
}

export function Header({ route, dev }: HeaderProps): ReactElement {
  const session = useSession().session;
  const websiteSignIn = useWebsiteSignIn();
  const website = session?.authMode === 'website';
  const account = useAccount();
  const links = useLinks(route);
  return (
    <div className="sbr-header" data-session={session === null ? 'loading' : 'known'}>
      <AppHeader
        websiteMode={website}
        brand={{
          href: hrefOf({ name: 'lobby' }),
          emblem: <img src={emblem} alt="" width="42" height="37" />,
          name: 'Seasonal Bingo Royale',
        }}
        links={links}
        navExtra={<NavExtra route={route} dev={dev} />}
        account={account}
        signIn={
          websiteSignIn === null
            ? { href: hrefOf({ name: 'signIn' }), registerHref: hrefOf({ name: 'register' }) }
            : { href: websiteSignIn }
        }
        // The server has no quick sign-in in website mode (D37).
        devTools={
          dev && DevSignIn !== null && !website ? (
            <Suspense fallback={null}>
              <DevSignIn />
            </Suspense>
          ) : null
        }
        // A new route or another account: the folded menu has done its job.
        closeKey={`${JSON.stringify(route)} ${session?.account?.id ?? ''}`}
        buttonClassName="sbr-btn"
        // Below 960 px always folded; from it up the measured fold decides (K40).
        foldBelow={960}
      />
    </div>
  );
}
