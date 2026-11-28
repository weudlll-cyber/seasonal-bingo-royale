/**
 * @file   apps/web/src/shell/session.tsx
 * @module web/shell
 * @brief  The signed-in session for the whole client: who, permissions, CSRF token.
 *
 * Responsibility: load GET /session on start (website mode: a visitor without one gets a
 *                 watch-only guest session first), keep its CSRF token for ./http, offer sign-in,
 *                 registration and sign-out (dev quick sign-in lives in ./DevTools and calls
 *                 `refresh`). Only the newest refresh sets the session (a late older answer never
 *                 undoes a sign-in). Screens read it via `useSession`, the server's form limits
 *                 via `useLimits` (admin-area §8 (m)), screen values via `useScreens` (§8 (i));
 *                 `highestRole` names the highest role for the account chip. The answer names the
 *                 server's time: `useServerCountdown` counts to a server moment on its clock (K69).
 * Depends on:     react, @sbr/contracts (types), @seasonal/kit (clockOffset, useCountdown), ./http,
 *                 ../game/socket
 * Used by:        ./AppShell, ../quicktest/TestMatch, ../account/Register, ../account/SignIn,
 *                 ../game/Lobby, ../game/WaitingRoom, ../main, ./DevTools, ../test/matchFixture,
 *                 ../account/AccountPage, ../league/LeaderboardPage
 * Spec:           docs/spec/05-api-design.md §2.1; docs/spec/03-security-architecture.md §3, §8
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import {
  type Step,
  clientScreensOf,
  SCREEN_DEFAULTS,
  type ClientLimits,
  type ClientScreens,
} from '@sbr/contracts';
import { clockOffset } from '@seasonal/kit';
import { useCountdown } from '@seasonal/kit/react';

import { resetSocket } from '../game/socket.js';
import { api, setCsrfToken } from './http.js';

interface SessionInfo {
  readonly signedIn: boolean;
  // null without any session; 'guest' for a watch-only one.
  readonly kind?: 'player' | 'admin' | 'guest' | null;
  // A local admin's second sign-in step still to do (D60).
  readonly twoFactor?: 'enrol' | 'code' | null;
  readonly features?: { readonly guests: boolean; readonly passwordReset?: boolean };
  // Website mode: the member's own Discord steps, which the header shows (kit K56).
  readonly account: {
    readonly id: string;
    readonly displayName: string;
    readonly steps?: readonly Step[];
  } | null;
  readonly permissions: readonly string[];
  readonly csrfToken: string | null;
  // The server's clock when it answered, for countdowns (K69).
  readonly serverTime?: number;
  // D37: `website` — players sign in only through the website, at `signInPath`.
  readonly authMode?: 'local' | 'website';
  readonly signInPath?: string;
  // Website mode: the website's chat room and its embed page on the same site (07 §6).
  readonly chat?: { readonly path: string; readonly room: string };
  // The limits the server checks forms with; forms read them here and keep no copy
  // (admin-area §8 (m)).
  readonly limits?: ClientLimits;
  // What players see that is not a rule (admin-area §8 (i)), read at page load.
  readonly screens?: ClientScreens;
}

interface SessionContextValue {
  readonly session: SessionInfo | null;
  readonly refresh: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  // Local accounts (05 §2.1); both throw ApiError with the server's code on refusal.
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly register: (account: NewAccount) => Promise<void>;
  readonly can: (permission: string) => boolean;
  // Add to the page's clock to get the server's; null until an answer has named its time.
  readonly clockOffsetMs: number | null;
}

interface NewAccount {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// A guest session (watch only), then the session again; without one, the answer as it was.
async function asGuest(before: SessionInfo): Promise<SessionInfo> {
  try {
    await api('/auth/guest', { method: 'POST', body: {} });
    resetSocket();
    return await api<SessionInfo>('/session');
  } catch {
    return before;
  }
}

export function SessionProvider({ children }: { children: ReactNode }): ReactElement {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState<number | null>(null);
  // Only the latest refresh counts: the answer to an older one (e.g. the first load, still
  // on its way when a sign-in finished) must not undo a newer session.
  const latest = useRef(0);
  const refresh = useCallback(async () => {
    latest.current += 1;
    const mine = latest.current;
    const sentAt = Date.now();
    let next = await api<SessionInfo>('/session');
    const { serverTime } = next;
    const offset =
      serverTime === undefined
        ? null
        : clockOffset([{ sentAt, receivedAt: Date.now(), serverTime }]);
    // Website mode: a visitor without a game session watches as a guest (live updates need a
    // session); playing still needs the website sign-in.
    if (next.authMode === 'website' && next.kind === null && next.features?.guests === true) {
      next = await asGuest(next);
    }
    if (mine !== latest.current) return;
    setCsrfToken(next.csrfToken);
    setClockOffsetMs(offset);
    setSession(next);
  }, []);
  useEffect(() => {
    // A failed first load shows "signed out", unless a newer refresh has answered meanwhile.
    refresh().catch(() => {
      setSession(
        (now) => now ?? { signedIn: false, account: null, permissions: [], csrfToken: null },
      );
    });
  }, [refresh]);
  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      refresh,
      signOut: async () => {
        await api('/auth/logout', { method: 'POST', body: {} });
        resetSocket();
        await refresh();
      },
      signIn: async (email, password) => {
        await api('/auth/login', { method: 'POST', body: { email, password } });
        resetSocket();
        await refresh();
      },
      register: async (account) => {
        await api('/auth/register', { method: 'POST', body: account });
        resetSocket();
        await refresh();
      },
      can: (permission) => session?.permissions.includes(permission) === true,
      clockOffsetMs,
    }),
    [session, refresh, clockOffsetMs],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession outside SessionProvider');
  return value;
}

// Whole seconds left to a moment the server announced, on the server's clock (the kit's
// `useCountdown`); null while the moment or the clock is unknown. Display only.
export function useServerCountdown(at: number | null): number | null {
  return useCountdown(at, useContext(SessionContext)?.clockOffsetMs ?? null);
}

// The highest role a session holds, for the account chip: the owner changes the Technical
// section, an Admin sees the admin area, an organizer starts matches, else a player.
export function highestRole(can: (permission: string) => boolean): string {
  if (can('technical.edit')) return 'owner';
  if (can('admin.view')) return 'admin';
  return can('match.create') ? 'organizer' : 'player';
}

// The server's form limits, or null until the session has answered.
export function useLimits(): ClientLimits | null {
  return useContext(SessionContext)?.session?.limits ?? null;
}

const TODAY_SCREENS = clientScreensOf(SCREEN_DEFAULTS);

// The screen values ("Screens and texts", admin-area §8 (i)): the server's, today's until the
// session has answered.
export function useScreens(): ClientScreens {
  return useContext(SessionContext)?.session?.screens ?? TODAY_SCREENS;
}
