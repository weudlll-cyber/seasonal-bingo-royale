/**
 * @file   apps/web/src/game/Lobby.tsx
 * @module web/game
 * @brief  The lobby: open, running and just-finished matches, to join or watch (WP-12).
 *
 * Responsibility: list GET /matches (refreshed every 3 seconds) as cards with title, game
 *                 type, status, code, players, draw mode and missed-number rule; "Manage"
 *                 for the match's host (the server says who that is) while it is open or
 *                 running, "Join" for an open lobby (signed-in players), "Watch" or "View". Joining calls
 *                 POST /matches/:code/join and opens the match. Without a session it points
 *                 to the sign-in buttons.
 * Depends on:     react, ../shell/http, ../shell/router, ../shell/session, ./useLiveMatch (types), ./labels
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §3a, §5, §6, §13
 */
import { useEffect, useState, type ReactElement } from 'react';

import { api, ApiError } from '../shell/http.js';
import { hrefOf, navigate } from '../shell/router.js';
import { useSession } from '../shell/session.js';
import { gameTypeName, problemText, rulesLine, statusName } from './labels.js';
import type { MatchSummary } from './useLiveMatch.js';
import './game.css';

export function useMatchList(): {
  readonly matches: readonly MatchSummary[] | null;
  readonly error: string | null;
} {
  const [matches, setMatches] = useState<readonly MatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      api<{ matches: MatchSummary[] }>('/matches')
        .then((r) => {
          if (alive) setMatches(r.matches);
        })
        .catch(() => {
          if (alive) setError('The lobby is not reachable right now.');
        });
    };
    load();
    const timer = window.setInterval(load, 3_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  return { matches, error };
}

export function Lobby(): ReactElement {
  const { session, can } = useSession();
  const { matches, error } = useMatchList();
  const [joinError, setJoinError] = useState<string | null>(null);
  const join = (code: string): void => {
    api(`/matches/${code}/join`, { method: 'POST', body: {} })
      .then(() => {
        navigate({ name: 'match', code });
      })
      .catch((e: unknown) => {
        setJoinError(
          e instanceof ApiError ? `Could not join: ${problemText(e.code)}` : 'Could not join.',
        );
      });
  };
  return (
    <div className="sbr-stack">
      <div className="lobby-head">
        <h1>Lobby</h1>
        <p className="sbr-muted">
          {session?.account
            ? 'Join an open match, or watch one that is running.'
            : 'Sign in to join a match. You can watch without signing in.'}
        </p>
      </div>
      {(joinError ?? error) !== null ? <p className="lobby-error">{joinError ?? error}</p> : null}
      {matches === null ? <p className="sbr-muted">Loading…</p> : null}
      {matches?.length === 0 ? (
        <p className="sbr-panel sbr-muted" data-testid="lobby-empty">
          No match is open right now.{can('match.create') ? ' Host one with “Host a match”.' : ''}
        </p>
      ) : null}
      <ul className="lobby-list" data-testid="lobby-list">
        {matches?.map((m) => (
          <LobbyItem key={m.code} match={m} canJoin={can('match.join')} onJoin={join} />
        ))}
      </ul>
    </div>
  );
}

interface LobbyItemProps {
  readonly match: MatchSummary;
  readonly canJoin: boolean;
  readonly onJoin: (code: string) => void;
}

// The signed-in account hosts this match and it can still be run (server says so).
export function manageable(m: MatchSummary): boolean {
  return m.youHost === true && (m.status === 'lobby' || m.status === 'running');
}

function LobbyItem({ match: m, canJoin, onJoin }: LobbyItemProps): ReactElement {
  const done = m.status === 'finished' || m.status === 'aborted';
  return (
    <li className="sbr-panel lobby-item" data-testid={`lobby-match-${m.code}`}>
      <div className="lobby-item-head">
        <h2>{m.title}</h2>
        {m.status === 'running' ? <span className="sbr-badge-live">LIVE</span> : null}
      </div>
      <p className="sbr-row">
        <span className="sbr-chip">{gameTypeName(m.gameType)}</span>
        <span className="sbr-chip">
          {m.players} / {m.maxPlayers} players
        </span>
        <span className="sbr-chip">{statusName(m.status)}</span>
        <span className="sbr-chip" data-testid={`code-${m.code}`}>
          Code {m.code}
        </span>
      </p>
      <p className="sbr-muted">{rulesLine(m)}</p>
      <div className="sbr-row">
        {manageable(m) ? (
          <a
            className="sbr-btn sbr-btn--primary"
            href={hrefOf({ name: 'host', code: m.code })}
            data-testid={`manage-${m.code}`}
          >
            Manage
          </a>
        ) : m.status === 'lobby' && canJoin ? (
          <button
            type="button"
            className="sbr-btn sbr-btn--primary"
            data-testid={`join-${m.code}`}
            onClick={() => {
              onJoin(m.code);
            }}
          >
            Join
          </button>
        ) : null}
        <a className="sbr-btn" href={`#/match/${m.code}`}>
          {done ? 'View' : 'Watch'}
        </a>
      </div>
    </li>
  );
}
