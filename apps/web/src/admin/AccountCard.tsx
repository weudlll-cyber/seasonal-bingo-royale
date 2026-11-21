/**
 * @file   apps/web/src/admin/AccountCard.tsx
 * @module web/admin
 * @brief  One account in Players and accounts: its facts and the actions on it.
 *
 * Responsibility: the name, e-mail, roles in words, locked or not, whether a second step is set
 *                 up and the last sign-in; the buttons: Organizer on or off, Admin on or off
 *                 (only for the owner, `admins.manage`), lock or unlock, reset the second step
 *                 (when there is one) and end the sessions, each handed to the page as an
 *                 action (path, body, words). The server decides what is allowed.
 * Depends on:     react, ./changeText (when)
 * Used by:        ./AdminAccounts
 * Spec:           docs/concepts/admin-area.md §2, §4 (Players and accounts), §9 piece 8
 */
import type { ReactElement } from 'react';

import { when } from './changeText.js';

export interface AccountView {
  readonly id: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly roles: readonly string[];
  readonly status: 'active' | 'suspended';
  readonly secondStep: boolean;
  readonly lastLoginAt: number | null;
}

export interface Action {
  readonly accountId: string;
  readonly path: string;
  readonly body: object;
  readonly label: string;
}

const ROLE_NAMES: Readonly<Record<string, string>> = {
  player: 'Player',
  organizer: 'Organizer',
  game_admin: 'Admin',
  super_admin: 'Owner',
};

// The actions this account offers: words on the button, the route, the body, the words after.
function actionsOf(x: AccountView, admins: boolean): [string, string, object, string][] {
  const has = (role: string) => x.roles.includes(role);
  const organizer = has('organizer');
  const admin = has('game_admin');
  const locked = x.status === 'suspended';
  return [
    [
      organizer ? 'Remove Organizer' : 'Make Organizer',
      'role',
      { role: 'organizer', on: !organizer },
      organizer ? 'Organizer removed' : 'Organizer given',
    ],
    ...(admins
      ? [
          [
            admin ? 'Remove Admin' : 'Make Admin',
            'role',
            { role: 'game_admin', on: !admin },
            admin ? 'Admin removed' : 'Admin given',
          ] as [string, string, object, string],
        ]
      : []),
    [locked ? 'Unlock' : 'Lock', 'lock', { locked: !locked }, locked ? 'unlocked' : 'locked'],
    ...(x.secondStep
      ? [
          ['Reset second step', 'reset-2fa', {}, 'second step reset'] as [
            string,
            string,
            object,
            string,
          ],
        ]
      : []),
    ['End sessions', 'end-sessions', {}, 'sessions ended'],
  ];
}

export function AccountCard(props: {
  readonly account: AccountView;
  readonly admins: boolean;
  readonly onAct: (a: Action) => void;
}): ReactElement {
  const x = props.account;
  return (
    <li className="admin-match sbr-stack" data-testid={`account-${x.displayName}`}>
      <p>
        <strong>{x.displayName}</strong>
        {x.email === null ? null : <span className="sbr-muted"> · {x.email}</span>}
      </p>
      <p className="sbr-muted admin-match-facts">
        {x.roles.map((r) => ROLE_NAMES[r] ?? r).join(', ')} ·{' '}
        {x.status === 'suspended' ? 'Locked' : 'Active'} ·{' '}
        {x.secondStep ? 'second step set up' : 'no second step'} ·{' '}
        {x.lastLoginAt === null ? 'never signed in' : `last sign-in ${when(x.lastLoginAt)}`}
      </p>
      <div className="admin-actions">
        {actionsOf(x, props.admins).map(([label, path, body, done]) => (
          <button
            key={label}
            type="button"
            className="sbr-btn"
            onClick={() => {
              props.onAct({ accountId: x.id, path, body, label: `${done} (${x.displayName})` });
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </li>
  );
}
