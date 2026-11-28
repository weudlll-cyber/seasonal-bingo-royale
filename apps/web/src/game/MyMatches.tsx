/**
 * @file   apps/web/src/game/MyMatches.tsx
 * @module web/game
 * @brief  The lobby's "My matches": the signed-in player's matches that are not over (D39).
 *
 * Responsibility: the `mine` part of the lobby's GET /matches answer (./Lobby, one refresh
 *                 for both, so they always agree) as one row per match with its title, pace ("Realtime" / "Asynchronous"), where it stands
 *                 ("Waiting for the host", "Starts at 22:25", "Starts or closes at …", with
 *                 every place taken "Full · " before it, "Round 2 · you're through", "Out in cut 1 · watching"),
 *                 a dot and "new" when an asynchronous match has events the player has not
 *                 seen (the server's `news`, D54) and "Open", which opens
 *                 it in this tab. Hidden while the list is empty (a guest's is). The server
 *                 decides every fact; this only puts them into words. On a wide page (owner
 *                 decision of 2026-11-28) it is the kit's dense list with "My matches" on the
 *                 first row's line, a small "Open", two rows in sight and the rest scrolling.
 * Depends on:     react, @sbr/contracts (types), ../components/ScrollBox, ../shell/router,
 *                 ./Registration (whenText),
 *                 ./game.css
 * Used by:        ./Lobby
 * Spec:           docs/spec/01-game-design.md §13 (D39); docs/spec/05-api-design.md §2.2
 */
import type { MyMatch } from '@sbr/contracts';
import type { ReactElement } from 'react';

import { ScrollBox } from '../components/ScrollBox.js';
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
  const start = lobbyStart(m, now);
  // Every place is taken: the start rule still holds.
  return m.full ? `Full · ${start}` : start;
}

function lobbyStart(m: MyMatch, now: number): string {
  // An asynchronous lobby starts or is cancelled at this time (D33, D34).
  if (m.lobbyClosesAt !== null) return `Starts or closes ${whenText(m.lobbyClosesAt, now)}`;
  if (m.startAt !== null) return `Starts ${whenText(m.startAt, now)}`;
  return m.startsWhenFull ? 'Waiting for players' : 'Waiting for the host';
}

export function MyMatches({
  matches,
  wide = false,
}: {
  readonly matches: readonly MyMatch[];
  readonly wide?: boolean;
}): ReactElement | null {
  if (matches.length === 0) return null;
  const now = Date.now();
  const rows = (
    <ul className={`own-matches${wide ? ' sk-dense-list' : ''}`}>
      {matches.map((m) => (
        <li key={m.code} className="own-match" data-testid={`my-match-${m.code}`}>
          <span>
            <strong>{m.title}</strong>
            <span className="sbr-muted">
              {' '}
              · {m.mode === 'async' ? 'Asynchronous' : 'Realtime'} ·{' '}
              <span data-testid={`my-match-state-${m.code}`}>{myMatchState(m, now)}</span>
            </span>
            {m.news && (
              <span className="own-match__new" data-testid={`my-match-new-${m.code}`}>
                new
              </span>
            )}
          </span>
          <a
            className={wide ? 'sk-btn own-match__open' : 'sk-btn sk-btn--primary'}
            href={hrefOf({ name: 'match', code: m.code })}
            data-testid={`my-open-${m.code}`}
          >
            Open
          </a>
        </li>
      ))}
    </ul>
  );
  return (
    <section
      className={`sk-panel ${wide ? 'my-matches--wide' : 'sbr-stack'}`}
      data-testid="my-matches"
      aria-label="My matches"
    >
      <h2>My matches</h2>
      {wide ? (
        // Two rows in sight; the rest scroll (./game.css).
        <ScrollBox
          className="my-matches-box"
          role="region"
          aria-label="My matches list"
          tabIndex={0}
        >
          {rows}
        </ScrollBox>
      ) : (
        rows
      )}
    </section>
  );
}
