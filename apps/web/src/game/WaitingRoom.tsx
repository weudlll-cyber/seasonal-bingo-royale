/**
 * @file   apps/web/src/game/WaitingRoom.tsx
 * @module web/game
 * @brief  The waiting room before a match starts: rules, players, countdown, join (WP-12).
 *
 * Responsibility: show the match's title, game type, prizes (classic types) and rules in
 *                 plain words, every player who joined, and — once the host pressed Start —
 *                 a countdown to the first round. A signed-in player who has not joined yet
 *                 gets a Join button.
 * Depends on:     react, ../shell/http, ../shell/session, ../useSecondsUntil, ../playback (types),
 *                 ./useLiveMatch, ./labels
 * Used by:        ./MatchScreen
 * Spec:           docs/spec/01-game-design.md §3a, §5, §6; docs/spec/05-api-design.md §2.3
 */
import type { ReactElement } from 'react';

import type { PlaybackView } from '../playback.js';
import { api } from '../shell/http.js';
import { useSession } from '../shell/session.js';
import { useSecondsUntil } from '../useSecondsUntil.js';
import { HostLink } from './HostLink.js';
import { gameTypeName, prizeName, rulesLine } from './labels.js';
import type { LiveState } from './useLiveMatch.js';

export function WaitingRoom({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement {
  const { can } = useSession();
  const joined = live.me !== null;
  return (
    <div className="sbr-stack waiting" data-testid="waiting-room">
      <header className="sbr-stack">
        <HostLink match={live.match} />
        <h1>{live.match.title}</h1>
        <p className="sbr-muted">
          {gameTypeName(live.match.gameType)} · {rulesLine(live.match)}
        </p>
        {live.match.prizes.length > 0 ? (
          <p className="sbr-row">
            {live.match.prizes.map((p) => (
              <span key={p} className="sbr-chip">
                {prizeName(p)}
              </span>
            ))}
          </p>
        ) : null}
      </header>
      <Countdown startsAt={live.match.startsAt} />
      <section className="sbr-panel">
        <h2>
          Players {live.match.players} / {live.match.maxPlayers}
        </h2>
        <ul className="waiting-players" data-testid="waiting-players">
          {view.standings.map((p) => (
            <li key={p.accountId} className={p.isOwner ? 'is-me' : undefined}>
              {p.accountId}
              {p.isOwner ? ' (you)' : ''}
            </li>
          ))}
        </ul>
      </section>
      {!joined && can('match.join') ? (
        <button
          type="button"
          className="sbr-btn sbr-btn--primary sbr-btn--big"
          data-testid="join-match"
          onClick={() => void api(`/matches/${live.match.code}/join`, { method: 'POST', body: {} })}
        >
          Join this match
        </button>
      ) : null}
      {joined ? <p className="sbr-muted">You are in. The host starts the match.</p> : null}
    </div>
  );
}

function Countdown({ startsAt }: { readonly startsAt: number | null }): ReactElement | null {
  const left = useSecondsUntil(startsAt);
  if (left === null) return null;
  return (
    <p className="countdown" data-testid="countdown" aria-live="polite">
      Starting in <strong>{left}</strong> s
    </p>
  );
}
