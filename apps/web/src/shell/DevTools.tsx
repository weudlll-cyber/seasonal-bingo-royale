/**
 * @file   apps/web/src/shell/DevTools.tsx
 * @module web/shell
 * @brief  Development-only parts of the top bar: the "Dev sign-in" menu and the Quick Test link.
 *
 * Responsibility: a compact "Dev sign-in" menu (the kit's DevSignIn) with "Sign in as host" /
 *                 "Sign in as admin" (the admin area's Admin) / "Sign in as owner" / "Sign in as
 *                 player 1/2/3" and a hint that one window holds one sign-in (05 §2.1), and the
 *                 navigation link to the Quick Test; `useDevSignIn` for the test page's
 *                 "Sign in as host". Loaded on demand by ./AppShell only
 *                 when Vite's DEV flag is set, so a production bundle contains neither
 *                 these parts nor the quick sign-in call (POST /dev/sign-in).
 * Depends on:     react, @seasonal/kit/react/dev (DevSignIn), ./http, ./router, ./session,
 *                 ../game/socket
 * Used by:        ./AppShell (lazy import), ../quicktest/TestMatch (development only)
 * Spec:           docs/spec/05-api-design.md §2.1; docs/spec/01-game-design.md §13
 */
import { DevSignIn as KitDevSignIn } from '@seasonal/kit/react/dev';
import type { ReactElement } from 'react';

import { resetSocket } from '../game/socket.js';
import { api } from './http.js';
import { hrefOf } from './router.js';
import { useSession } from './session.js';

type DevIdentity = 'host' | 'admin' | 'owner' | 'player-1' | 'player-2' | 'player-3';

const DEV_IDENTITIES: readonly { readonly as: DevIdentity; readonly label: string }[] = [
  { as: 'host', label: 'Sign in as host' },
  // The admin area's Admin (dev-admin, game_admin).
  { as: 'admin', label: 'Sign in as admin' },
  // The owner (dev-owner, super_admin): the Technical section.
  { as: 'owner', label: 'Sign in as owner' },
  { as: 'player-1', label: 'Sign in as player 1' },
  { as: 'player-2', label: 'Sign in as player 2' },
  { as: 'player-3', label: 'Sign in as player 3' },
];

export function QuickTestLink({ active }: { readonly active: boolean }): ReactElement {
  return (
    <a href={hrefOf({ name: 'quicktest' })} aria-current={active ? 'page' : undefined}>
      Quick Test
    </a>
  );
}

// The quick sign-in call, for the menu and the test page's "Sign in as host".
export function useDevSignIn(): (as: DevIdentity) => Promise<void> {
  const { refresh } = useSession();
  return async (as) => {
    await api('/dev/sign-in', { method: 'POST', body: { as } });
    resetSocket(); // the socket reconnects with the new session cookie
    await refresh();
  };
}

// One compact menu instead of four buttons in the bar: the kit's, with Bingo's identities.
export function DevSignIn(): ReactElement {
  const devSignIn = useDevSignIn();
  return (
    <KitDevSignIn
      identities={DEV_IDENTITIES}
      onSignIn={(as) => devSignIn(as as DevIdentity)}
      buttonClassName="sk-btn"
    />
  );
}
