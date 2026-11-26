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
 *                 "Signed in as <name> (role)" (website mode: the member's step badges, K56) with
 *                 "Sign out", or "Sign in"/"Register"
 *                 (../account; website mode one "Sign in", D37); hidden until the session is known
 *                 (`data-session`, ./header.css; in development also until the dev tools have loaded). The folded menu closes on a new route or a
 *                 sign-in. The chat has no button here: it is docked under the game (./DockedChat).
 * Depends on:     react, @seasonal/kit/react (AppHeader), ./router, ./session,
 *                 ./DevTools (loaded on demand, development only), ../account/WebsiteSignIn,
 *                 ./header.css, assets/brand/emblem.webp
 * Used by:        ./AppShell
 * Spec:           docs/spec/01-game-design.md §13; docs/spec/05-api-design.md §2.1, §2.4;
 *                 Seasonal Entertainment docs/GAME-INTEGRATION.md §8
 */
import { AppHeader, type HeaderAccount, type HeaderLink } from '@seasonal/kit/react';
import { useEffect, useState, type ReactElement } from 'react';

import emblem from '../../../../assets/brand/emblem.webp';
import { useWebsiteSignIn } from '../account/WebsiteSignIn.js';
import { hrefOf, type Route } from './router.js';
import { highestRole, useSession } from './session.js';
import './header.css';

// Development tools load on demand. A production build replaces import.meta.env.DEV with
// false, so this import and everything behind it stays out of the bundle (audit B).
const loadDevTools = import.meta.env.DEV ? () => import('./DevTools.js') : null;

type DevTools = typeof import('./DevTools.js');

interface HeaderProps {
  readonly route: Route;
  readonly dev: boolean;
}

// The development tools once they are there, or null (never in production).
function useDevTools(wanted: boolean): DevTools | null {
  const [tools, setTools] = useState<DevTools | null>(null);
  useEffect(() => {
    if (!wanted || loadDevTools === null) return undefined;
    let live = true;
    void loadDevTools().then((loaded) => {
      if (live) setTools(loaded);
    });
    return () => {
      live = false;
    };
  }, [wanted]);
  return tools;
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

// The signed-in account as the header shows it (website mode: with the member's steps), or null.
function useAccount(): HeaderAccount | null {
  const { session, signOut, can } = useSession();
  const account = session?.account ?? null;
  if (account === null) return null;
  return {
    name: account.displayName,
    role: highestRole(can),
    href: hrefOf({ name: 'account' }),
    onSignOut: () => void signOut(),
    // Website mode: the member's step badges (K56); a standalone install has none.
    ...(account.steps === undefined ? {} : { steps: account.steps }),
  };
}

export function Header({ route, dev }: HeaderProps): ReactElement {
  const session = useSession().session;
  const tools = useDevTools(dev);
  // The account row shows only once everything in it is there: a menu arriving later moved
  // "Sign in" under the pointer (a click then landed beside it).
  const ready = session !== null && (!dev || loadDevTools === null || tools !== null);
  const websiteSignIn = useWebsiteSignIn();
  const website = session?.authMode === 'website';
  const account = useAccount();
  const links = useLinks(route);
  return (
    <div className="sbr-header" data-session={ready ? 'known' : 'loading'}>
      <AppHeader
        websiteMode={website}
        brand={{
          href: hrefOf({ name: 'lobby' }),
          emblem: <img src={emblem} alt="" width="42" height="37" />,
          name: 'Seasonal Bingo Royale',
        }}
        links={links}
        // After the links: the development Quick Test link.
        navExtra={
          tools === null ? null : <tools.QuickTestLink active={route.name === 'quicktest'} />
        }
        account={account}
        signIn={
          websiteSignIn === null
            ? { href: hrefOf({ name: 'signIn' }), registerHref: hrefOf({ name: 'register' }) }
            : { href: websiteSignIn }
        }
        // The server has no quick sign-in in website mode (D37).
        devTools={tools === null || website ? null : <tools.DevSignIn />}
        // A new route or another account: the folded menu has done its job.
        closeKey={`${JSON.stringify(route)} ${session?.account?.id ?? ''}`}
        buttonClassName="sk-btn"
        // Below 960 px always folded; from it up the measured fold decides (K40).
        foldBelow={960}
      />
    </div>
  );
}
