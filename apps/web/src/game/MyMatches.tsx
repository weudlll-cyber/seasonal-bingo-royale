/**
 * @file   apps/web/src/game/MyMatches.tsx
 * @module web/game
 * @brief  The lobby's "My matches": the signed-in player's matches that are not over (D39).
 *
 * Responsibility: for a signed-in account, GET /me/matches (refreshed every 3 seconds) as one row
 *                 per match with its title, pace ("Realtime" / "Asynchronous"), where it stands
 *                 ("Waiting for the host", "Starts at 22:25", "Starts or closes at …",
 *                 "Round 2 · you're through", "Out in cut 1 · watching") and "Open", which opens
 *                 it in this tab. Hidden for a guest and while the list is empty. The server
 *                 decides every fact; this only puts them into words.
 * Depends on:     react, @sbr/contracts (types), ../shell/http, ../shell/router, ../shell/session,
 *                 ./Registration (whenText), ./game.css
 * Used by:        ./Lobby
 * Spec:           docs/spec/01-game-design.md §13 (D39); docs/spec/05-api-design.md §2.2
 */
import type { MyMatch, MyMatches as MyMatchList } from '@sbr/contracts';
import { useEffect, useState, type ReactElement } from 'react';

import { api } from '../shell/http.js';
import { hrefOf } from '../shell/router.js';
import { useSession } from '../shell/session.js';
import { whenText } from './Registration.js';
import './game.css';

// Where the match stands for the player, in the lobby's words.
export function myMatchState(m: MyMatch, now: number): string {
  if (m.status === 'running') {
    if (m.outInCut !== null) return `Out in cut ${String(m.outInCut)} · watching`;
    const round = `Round ${String((m.roundIndex ?? 0) + 1)}`;
    return m.cutsSurvived > 0 ? `${round} · you're through` : round;
  }
  if (m.startsAt !== null) return 'Starting…';
  // An asynchronous lobby starts or is cancelled at this time (D33, D34).
  if (m.lobbyClosesAt !== null) return `Starts or closes ${whenText(m.lobbyClosesAt, now)}`;
  if (m.startAt !== null) return `Starts ${whenText(m.startAt, now)}`;
  return m.startsWhenFull ? 'Waiting for players' : 'Waiting for the host';
}

function useMyMatches(signedIn: boolean): readonly MyMatch[] {
  const [matches, setMatches] = useState<readonly MyMatch[]>([]);
  useEffect(() => {
    if (!signedIn) {
      setMatches([]);
      return undefined;
    }
    let alive = true;
    const load = (): void => {
      api<MyMatchList>('/me/matches')
        .then((r) => {
          if (alive) setMatches(r.matches);
        })
        // The lobby list below says when the server is not reachable.
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 3_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [signedIn]);
  return matches;
}

export function MyMatches(): ReactElement | null {
  const signedIn = (useSession().session?.account ?? null) !== null;
  const matches = useMyMatches(signedIn);
  if (matches.length === 0) return null;
  const now = Date.now();
  return (
    <section className="sbr-panel sbr-stack" data-testid="my-matches" aria-label="My matches">
      <h2>My matches</h2>
      <ul className="own-matches">
        {matches.map((m) => (
          <li key={m.code} className="own-match" data-testid={`my-match-${m.code}`}>
            <span>
              <strong>{m.title}</strong>
              <span className="sbr-muted">
                {' '}
                · {m.mode === 'async' ? 'Asynchronous' : 'Realtime'} ·{' '}
                <span data-testid={`my-match-state-${m.code}`}>{myMatchState(m, now)}</span>
              </span>
            </span>
            <a
              className="sbr-btn sbr-btn--primary"
              href={hrefOf({ name: 'match', code: m.code })}
              data-testid={`my-open-${m.code}`}
            >
              Open
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
