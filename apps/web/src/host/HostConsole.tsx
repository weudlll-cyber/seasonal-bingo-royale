/**
 * @file   apps/web/src/host/HostConsole.tsx
 * @module web/host
 * @brief  The host's console for one match: lobby, start, live draw control, results (05 §3).
 *
 * Responsibility: in the lobby, ./HostLobby (notice, players, bots, start rules, Start);
 *                 a match ended without a result shows its end page (../game/MatchCancelled,
 *                 D17); while running, the current and recent numbers, a big Draw next
 *                 (also on the Space key while no field has focus; usable only with host
 *                 draws and after the previous number's speed window closed, D10), the
 *                 timed/host switch and the seconds at any time (D8), "Start next round"
 *                 while the match waits for the host between rounds (D14), standings with active
 *                 players first, prizes awarded, the match log (newest first) with cut
 *                 results, and abort with a reason; at the end the final placement on top. Pause applies to asynchronous
 *                 matches only and is not offered here (realtime).
 * Depends on:     react, ../playback, ../components/*, ../game/*, ../shell/http, ./HostDrawControls,
 *                 ./HostLobby
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/05-api-design.md §3; docs/spec/11-admin-panel.md §3.2; docs/spec/01-game-design.md §5
 */
import { useState, type ReactElement } from 'react';

import { DrawTicker } from '../components/DrawTicker.js';
import { FinalPlacement } from '../components/FinalPlacement.js';
import { MatchLog, PrizeList } from '../components/Playback.js';
import { Standings } from '../components/Standings.js';
import { CurrentBall } from '../game/CurrentBall.js';
import { EndActions } from '../game/EndActions.js';
import { MatchCancelled } from '../game/MatchCancelled.js';
import { intent } from '../game/socket.js';
import '../game/game.css';
import { gameTypeName, problemText, progressText, rulesLine, statusName } from '../game/labels.js';
import { hrefOf } from '../shell/router.js';
import { useLiveMatch, type LiveState } from '../game/useLiveMatch.js';
import { playbackAt, type PlaybackView } from '../playback.js';
import { api } from '../shell/http.js';
import { HostDrawControls } from './HostDrawControls.js';
import { HostLobby } from './HostLobby.js';

export function HostConsole({ code }: { readonly code: string }): ReactElement {
  const { live, error } = useLiveMatch(code);
  if (live === null) return <p className="sbr-muted">{error ?? 'Loading the match…'}</p>;
  // Only the match's host gets controls (the server refuses everyone else as well).
  if (live.match.youHost !== true) return <NotYourMatch code={code} />;
  const view = playbackAt(live.view, live.view.events.length);
  return (
    <div className="sbr-stack" data-testid="host-console" data-seq={live.seq}>
      <header className="arena-head">
        <div>
          <h1>{live.match.title}</h1>
          <p className="sbr-muted">
            Code <strong data-testid="host-code">{live.match.code}</strong> ·{' '}
            <span data-testid="host-status" data-status={live.match.status}>
              {statusName(live.match.status)}
            </span>
            {live.match.status === 'running' || live.match.status === 'finished'
              ? ` · ${progressText(live, view)}`
              : null}
          </p>
          <p className="sbr-muted">
            {gameTypeName(live.match.gameType)} · {rulesLine(live.match)}
          </p>
        </div>
        {live.match.status === 'running' ? <span className="sbr-badge-live">LIVE</span> : null}
      </header>
      {live.match.status === 'lobby' ? <HostLobby live={live} view={view} /> : null}
      {live.match.status === 'aborted' ? <MatchCancelled live={live} titled={false} /> : null}
      {live.match.status === 'running' || live.match.status === 'finished' ? (
        <HostLive live={live} view={view} />
      ) : null}
    </div>
  );
}

function HostLive({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement {
  const result = live.view;
  const running = live.match.status === 'running';
  return (
    <div className="host-grid">
      {view.finished ? (
        <div className="sbr-stack host-end">
          <FinalPlacement result={result} view={view} />
          <EndActions host />
        </div>
      ) : null}
      <section className="sbr-stack">
        <CurrentBall
          draws={view.drawsSoFar}
          speedWindowMs={result.speedWindowMs}
          roundOver={view.roundOver}
          finished={view.finished}
        />
        <DrawTicker
          draws={view.drawsSoFar}
          speedWindowMs={result.speedWindowMs}
          showWindow={!view.finished}
        />
        {live.match.waitingForHost ? (
          <StartNextRound code={live.match.code} round={view.currentRound + 2} />
        ) : null}
        {running ? <HostDrawControls live={live} view={view} /> : null}
        {result.gameType === 'royale' ? null : <PrizeList result={result} view={view} />}
        {running ? <Abort code={live.match.code} /> : null}
      </section>
      {/* The log first, so a cut and its result are in view; at the end the final
          placement replaces the live standings. */}
      <aside className="sbr-stack">
        <MatchLog banners={view.banners} />
        {view.finished ? null : (
          <Standings view={view} showSeasons={result.gameType === 'royale'} />
        )}
      </aside>
    </div>
  );
}

// The pause between royale rounds when the host starts them (D14).
function StartNextRound({
  code,
  round,
}: {
  readonly code: string;
  readonly round: number;
}): ReactElement {
  const [note, setNote] = useState<string | null>(null);
  return (
    <section className="sbr-panel sbr-stack" data-testid="host-next-round-panel">
      <p>The round is over. Players wait for you to start round {round}.</p>
      <button
        type="button"
        className="sbr-btn sbr-btn--primary sbr-btn--big"
        data-testid="host-next-round"
        onClick={() => {
          void intent('round.next', { code }).then((a) => {
            setNote(a.ok ? null : problemText(a.code));
          });
        }}
      >
        Start next round
      </button>
      {note !== null ? <p className="lobby-error">{note}</p> : null}
    </section>
  );
}

function Abort({ code }: { readonly code: string }): ReactElement {
  const [reason, setReason] = useState('');
  return (
    <form
      className="sbr-row"
      onSubmit={(e) => {
        e.preventDefault();
        void api(`/matches/${code}/abort`, { method: 'POST', body: { reason } });
      }}
    >
      <input
        className="sbr-input"
        style={{ flex: '1 1 12rem' }}
        placeholder="Reason (shown to players)"
        value={reason}
        minLength={3}
        required
        onChange={(e) => {
          setReason(e.target.value);
        }}
        data-testid="abort-reason"
      />
      <button type="submit" className="sbr-btn sbr-btn--danger" data-testid="abort-match">
        Abort match
      </button>
    </form>
  );
}

function NotYourMatch({ code }: { readonly code: string }): ReactElement {
  return (
    <section className="sbr-panel sbr-stack" data-testid="not-your-match">
      <h1>Only the host can run this match</h1>
      <p className="sbr-muted">You are signed in with another account. You can watch the match.</p>
      <a className="sbr-btn sbr-btn--primary" href={hrefOf({ name: 'match', code })}>
        Watch the match
      </a>
    </section>
  );
}
