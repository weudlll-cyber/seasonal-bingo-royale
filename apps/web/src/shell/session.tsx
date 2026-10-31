/**
 * @file   apps/web/src/shell/session.tsx
 * @module web/shell
 * @brief  The signed-in session for the whole client: who, permissions, CSRF token.
 *
 * Responsibility: load GET /session on start, keep its CSRF token for ./http, and offer
 *                 sign-in, registration and sign-out (the development quick sign-in lives
 *                 in ./DevTools, outside the production bundle, and calls `refresh`).
 *                 Only the newest refresh sets the session (an older answer arriving late
 *                 never undoes a sign-in). Screens read it through `useSession`.
 * Depends on:     react, ./http, ../game/socket
 * Used by:        ./AppShell, ../account/Register, ../account/SignIn, ../game/Lobby,
 *                 ../game/WaitingRoom, ../main, ./DevTools
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

import { resetSocket } from '../game/socket.js';
import { api, setCsrfToken } from './http.js';

interface SessionInfo {
  readonly signedIn: boolean;
  readonly account: { readonly id: string; readonly displayName: string } | null;
  readonly permissions: readonly string[];
  readonly csrfToken: string | null;
}

interface SessionContextValue {
  readonly session: SessionInfo | null;
  readonly refresh: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  // Local accounts (05 §2.1); both throw ApiError with the server's code on refusal.
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly register: (account: NewAccount) => Promise<void>;
  readonly can: (permission: string) => boolean;
}

interface NewAccount {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): ReactElement {
  const [session, setSession] = useState<SessionInfo | null>(null);
  // Only the latest refresh counts: the answer to an older one (e.g. the first load, still
  // on its way when a sign-in finished) must not undo a newer session.
  const latest = useRef(0);
  const refresh = useCallback(async () => {
    latest.current += 1;
    const mine = latest.current;
    const next = await api<SessionInfo>('/session');
    if (mine !== latest.current) return;
    setCsrfToken(next.csrfToken);
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
