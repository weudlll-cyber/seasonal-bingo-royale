/**
 * @file   apps/web/src/game/WaitingRoom.tsx
 * @module web/game
 * @brief  The waiting room before a match starts: rules, players, countdown, join (WP-12).
 *
 * Responsibility: show the match's title, game type, prizes (classic types) and rules in
 *                 plain words, every player who joined, and — once the host pressed Start —
 *                 a countdown to the first round. A signed-in player who has not joined yet
 *                 gets a Join button.
 * Depends on:     react, ../shell/http, ../shell/session, ../playback (types), ./useLiveMatch, ./labels
 * Used by:        ./MatchScreen
 * Spec:           docs/spec/01-game-design.md §3a, §5, §6; docs/spec/05-api-design.md §2.3
 */
import { useEffect, useState, type ReactElement } from 'react';

import type { PlaybackView } from '../playback.js';
import { api } from '../shell/http.js';
import { useSession } from '../shell/session.js';
import { gameTypeName, rulesLine } from './labels.js';
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
      <header>
        <h1>{live.match.title}</h1>
        <p className="sbr-muted">
          {gameTypeName(live.match.gameType)} · {rulesLine(live.match)}
        </p>
        {live.match.prizes.length > 0 ? (
          <p className="sbr-row">
            {live.match.prizes.map((p) => (
              <span key={p} className="sbr-chip">
                {p}
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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startsAt === null) return undefined;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, [startsAt]);
  if (startsAt === null) return null;
  const left = Math.max(0, Math.ceil((startsAt - now) / 1000));
  return (
    <p className="countdown" data-testid="countdown" aria-live="polite">
      Starting in <strong>{left}</strong> s
    </p>
  );
}
