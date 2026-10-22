/**
 * @file   apps/web/src/shell/session.tsx
 * @module web/shell
 * @brief  The signed-in session for the whole client: who, permissions, CSRF token.
 *
 * Responsibility: load GET /session on start, keep its CSRF token for ./http, and offer
 *                 the development quick sign-in (host or player 1–3, 05 §2.1) and sign-out.
 *                 Screens read it through `useSession`.
 * Depends on:     react, ./http, ../game/socket
 * Used by:        ./AppShell and every screen that needs the account
 * Spec:           docs/spec/05-api-design.md §2.1; docs/spec/03-security-architecture.md §3, §8
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { resetSocket } from '../game/socket.js';
import { api, setCsrfToken } from './http.js';

export interface SessionInfo {
  readonly signedIn: boolean;
  readonly account: { readonly id: string; readonly displayName: string } | null;
  readonly permissions: readonly string[];
  readonly csrfToken: string | null;
}

export type DevIdentity = 'host' | 'player-1' | 'player-2' | 'player-3';

interface SessionContextValue {
  readonly session: SessionInfo | null;
  readonly refresh: () => Promise<void>;
  readonly devSignIn: (as: DevIdentity) => Promise<void>;
  readonly signOut: () => Promise<void>;
  // Local accounts (05 §2.1); both throw ApiError with the server's code on refusal.
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly register: (account: NewAccount) => Promise<void>;
  readonly can: (permission: string) => boolean;
}

export interface NewAccount {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): ReactElement {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const refresh = useCallback(async () => {
    const next = await api<SessionInfo>('/session');
    setCsrfToken(next.csrfToken);
    setSession(next);
  }, []);
  useEffect(() => {
    refresh().catch(() => {
      setSession({ signedIn: false, account: null, permissions: [], csrfToken: null });
    });
  }, [refresh]);
  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      refresh,
      devSignIn: async (as) => {
        await api('/dev/sign-in', { method: 'POST', body: { as } });
        resetSocket(); // the socket reconnects with the new session cookie
        await refresh();
      },
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
    }),
    [session, refresh],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession outside SessionProvider');
  return value;
}
