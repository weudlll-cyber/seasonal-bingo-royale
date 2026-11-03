/**
 * @file   apps/web/src/game/MyMatches.tsx
 * @module web/game
 * @brief  The lobby's "My matches": the signed-in player's matches that are not over (D39).
 *
 * Responsibility: the `mine` part of the lobby's GET /matches answer (./Lobby, one refresh
 *                 for both, so they always agree) as one row per match with its title, pace ("Realtime" / "Asynchronous"), where it stands
 *                 ("Waiting for the host", "Starts at 22:25", "Starts or closes at …",
 *                 "Round 2 · you're through", "Out in cut 1 · watching") and "Open", which opens
 *                 it in this tab. Hidden while the list is empty (a guest's is). The server
 *                 decides every fact; this only puts them into words.
 * Depends on:     react, @sbr/contracts (types), ../shell/router, ./Registration (whenText),
 *                 ./game.css
 * Used by:        ./Lobby
 * Spec:           docs/spec/01-game-design.md §13 (D39); docs/spec/05-api-design.md §2.2
 */
import type { MyMatch } from '@sbr/contracts';
import type { ReactElement } from 'react';

import { hrefOf } from '../shell/router.js';
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

export function MyMatches({
  matches,
}: {
  readonly matches: readonly MyMatch[];
}): ReactElement | null {
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
