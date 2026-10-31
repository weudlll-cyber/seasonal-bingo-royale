/**
 * @file   apps/web/src/host/HostConsole.tsx
 * @module web/host
 * @brief  The host's console for one match: lobby, start, live draw control, results (05 §3).
 *
 * Responsibility: lobby: ./HostLobby (notice, players, bots, start rules, Start); a match ended
 *                 without a result shows ../game/MatchCancelled (D17). Running: current and
 *                 recent numbers, Draw next (also Space outside fields; host draws only, after
 *                 the speed window, D10), the timed/host switch, seconds (D8), "Start next round"
 *                 when the host must start it (D14) or "Start next round now" in a timed pause
 *                 (D21, Draw next hidden), the round recap (../game/Interlude, D20), standings
 *                 (active first), prizes, log (newest first) with cuts, abort with a reason
 *                 (./AbortMatch); final placement on top at the end. No pause (async only).
 * Depends on:     react, ../playback, ../components/*, ../game/*, ./AbortMatch,
 *                 ./HostDrawControls, ./HostLobby, ./host.css, ../shell/router
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/05-api-design.md §3; docs/spec/11-admin-panel.md §3.2; docs/spec/01-game-design.md §5
 */
import { useState, type ReactElement } from 'react';

import { DrawTicker } from '../components/DrawTicker.js';
import { FinalPlacement } from '../components/FinalPlacement.js';
import { MatchLog, PrizeList } from '../components/Playback.js';
import { Standings } from '../components/Standings.js';
import { CurrentBall } from '../game/CurrentBall.js';
import { currentRecap, Interlude } from '../game/Interlude.js';
import { EndActions } from '../game/EndActions.js';
import { MatchCancelled } from '../game/MatchCancelled.js';
import { intent } from '../game/socket.js';
import '../game/game.css';
import './host.css';
import { gameTypeName, problemText, progressText, rulesLine, statusName } from '../game/labels.js';
import { hrefOf } from '../shell/router.js';
import { useLiveMatch, type LiveState } from '../game/useLiveMatch.js';
import { playbackAt, type PlaybackView } from '../playback.js';
import { HostDrawControls } from './HostDrawControls.js';
import { AbortMatch } from './AbortMatch.js';
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
          <EndActions host code={live.match.code} />
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
          paused={view.roundOver && !view.finished}
        />
        <BetweenRounds live={live} view={view} />
        {running ? <HostDrawControls live={live} view={view} /> : null}
        {result.gameType === 'royale' ? null : <PrizeList result={result} view={view} />}
        {running ? <AbortMatch code={live.match.code} /> : null}
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

// Between royale rounds: Start next round (D14) or Start next round now (D21), and the
// recap of the round just played below it (D20).
function BetweenRounds({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement {
  const recap = currentRecap(live.view.recaps, view);
  // A timed pause between royale rounds: the host may end it early (D21).
  const running = live.match.status === 'running';
  const timedPause = running && view.roundOver && live.match.nextRoundAt !== null;
  return (
    <>
      {live.match.waitingForHost || timedPause ? (
        <StartNextRound
          code={live.match.code}
          round={view.currentRound + 2}
          timed={!live.match.waitingForHost}
        />
      ) : null}
      {recap === null ? null : (
        <Interlude
          key={recap.roundIndex}
          recap={recap}
          pause={live.match.settings.roundPause}
          nextRoundAt={live.match.nextRoundAt}
          me={null}
        />
      )}
    </>
  );
}

// The pause between royale rounds when the host starts them (D14), or a timed pause the
// host may end early (D21): the same intent starts the next round for everyone.
function StartNextRound({
  code,
  round,
  timed,
}: {
  readonly code: string;
  readonly round: number;
  readonly timed: boolean;
}): ReactElement {
  const [note, setNote] = useState<string | null>(null);
  return (
    <section className="sbr-panel sbr-stack" data-testid="host-next-round-panel">
      <p>
        {timed
          ? `The round is over. Round ${String(round)} starts after the pause, or now if you start it.`
          : `The round is over. Players wait for you to start round ${String(round)}.`}
      </p>
      <button
        type="button"
        className="sbr-btn sbr-btn--primary sbr-btn--big"
        data-testid={timed ? 'host-next-round-now' : 'host-next-round'}
        onClick={() => {
          void intent('round.next', { code }).then((a) => {
            setNote(a.ok ? null : problemText(a.code));
          });
        }}
      >
        {timed ? 'Start next round now' : 'Start next round'}
      </button>
      {note !== null ? <p className="lobby-error">{note}</p> : null}
    </section>
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
