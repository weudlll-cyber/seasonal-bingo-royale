/**
 * @file   apps/web/src/shell/DevTools.tsx
 * @module web/shell
 * @brief  Development-only parts of the top bar: the "Dev sign-in" menu and the Quick Test link.
 *
 * Responsibility: a compact "Dev sign-in" menu with "Sign in as host" / "Sign in as player
 *                 1/2/3" and a hint that one window holds one sign-in (05 §2.1), and the
 *                 navigation link to the Quick Test. Loaded on demand by ./AppShell only
 *                 when Vite's DEV flag is set, so a production bundle does not contain it.
 * Depends on:     react, ./router, ./session
 * Used by:        ./AppShell (lazy import)
 * Spec:           docs/spec/05-api-design.md §2.1; docs/spec/01-game-design.md §13
 */
import { useState, type ReactElement } from 'react';

import { hrefOf } from './router.js';
import { useSession, type DevIdentity } from './session.js';

const DEV_IDENTITIES: readonly { readonly as: DevIdentity; readonly label: string }[] = [
  { as: 'host', label: 'Sign in as host' },
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

// One compact menu instead of four buttons in the bar.
export function DevSignIn(): ReactElement {
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
