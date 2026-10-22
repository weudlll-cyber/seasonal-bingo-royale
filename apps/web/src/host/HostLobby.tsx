/**
 * @file   apps/web/src/host/HostLobby.tsx
 * @module web/host
 * @brief  The host's console while the match is open: notice, players, start (01 §7.6, D16).
 *
 * Responsibility: the notice "Your match is open — players can join now from the lobby
 *                 (code …)" with the registration status (../game/Registration); the joined
 *                 players; "Fill with N
 *                 bots" (development only); for a set start time the switch "Start
 *                 automatically at the start time" (until the countdown runs) and, when the
 *                 automatic start found fewer than 2 players, "Not enough players at the
 *                 start time — start it yourself or abort"; Start match, which the host can
 *                 always press, or the countdown once it runs.
 * Depends on:     react, ../game/labels, ../game/Registration, ../game/useLiveMatch, ../playback, ../shell/http,
 *                 ./TimingFields
 * Used by:        ./HostConsole
 * Spec:           docs/spec/01-game-design.md §7.6; docs/spec/05-api-design.md §2.3, §3
 */
import { useState, type ReactElement } from 'react';

import { problemText } from '../game/labels.js';
import { RegistrationStatus } from '../game/Registration.js';
import type { LiveState } from '../game/useLiveMatch.js';
import type { PlaybackView } from '../playback.js';
import { api, ApiError } from '../shell/http.js';
import { AutoStartBox } from './TimingFields.js';

export function HostLobby({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  const call = (path: string, body: unknown): void => {
    api(`/matches/${live.match.code}/${path}`, { method: 'POST', body })
      .then(() => {
        setMessage(null);
      })
      .catch((e: unknown) => {
        setMessage(problemText(e instanceof ApiError ? e.code : ''));
      });
  };
  return (
    <section className="sbr-panel sbr-stack">
      <OpenNotice match={live.match} />
      <h2>
        Players {live.match.players} / {live.match.maxPlayers}
      </h2>
      <ul className="waiting-players" data-testid="host-players">
        {view.standings.map((p) => (
          <li key={p.accountId}>{p.accountId}</li>
        ))}
      </ul>
      {import.meta.env.DEV ? (
        <BotFill
          onFill={(upTo) => {
            call('bots', { upTo });
          }}
        />
      ) : null}
      <StartControls match={live.match} call={call} />
      {message !== null ? <p className="lobby-error">{message}</p> : null}
    </section>
  );
}

// The switch for a set start time, the notice when it found too few players, and Start
// match (always offered) or the running countdown.
function StartControls({
  match,
  call,
}: {
  readonly match: LiveState['match'];
  readonly call: (path: string, body: unknown) => void;
}): ReactElement {
  const rule = match.settings.startRule;
  const counting = match.startsAt !== null;
  return (
    <>
      {rule.kind === 'at' ? (
        <AutoStartBox
          testId="host-start-auto"
          checked={rule.auto}
          disabled={counting}
          onChange={(auto) => {
            call('auto-start', { auto });
          }}
        />
      ) : null}
      {match.tooFewAtStart ? (
        <p className="lobby-error" role="status" data-testid="host-too-few">
          Not enough players at the start time — start it yourself or abort.
        </p>
      ) : null}
      {counting ? (
        <p className="countdown" data-testid="host-countdown">
          Starting… players see the countdown.
        </p>
      ) : (
        <button
          type="button"
          className="sbr-btn sbr-btn--primary sbr-btn--big"
          data-testid="start-match"
          onClick={() => {
            call('start', {});
          }}
        >
          Start match
        </button>
      )}
    </>
  );
}

// Right after Create match and while the lobby is open: where players find it, how it starts.
function OpenNotice({ match }: { readonly match: LiveState['match'] }): ReactElement {
  return (
    <>
      <p className="open-notice" role="status" data-testid="open-match-notice">
        Your match is open — players can join now from the lobby (code {match.code}).
      </p>
      <p className="sbr-muted">
        <RegistrationStatus match={match} testId="host-start-rule" />
      </p>
    </>
  );
}

// Development only: fill the lobby with bots that mark automatically.
function BotFill({ onFill }: { readonly onFill: (upTo: number) => void }): ReactElement {
  const [bots, setBots] = useState(20);
  return (
    <div className="sbr-row">
      <label className="sbr-row">
        Fill with
        <input
          className="sbr-input"
          style={{ width: '6rem' }}
          type="number"
          min={2}
          max={200}
          value={bots}
          data-testid="bots-up-to"
          onChange={(e) => {
            setBots(Number(e.target.value));
          }}
        />
        players (bots mark automatically)
      </label>
      <button
        type="button"
        className="sbr-btn"
        data-testid="fill-bots"
        onClick={() => {
          onFill(bots);
        }}
      >
        Fill with bots
      </button>
    </div>
  );
}
