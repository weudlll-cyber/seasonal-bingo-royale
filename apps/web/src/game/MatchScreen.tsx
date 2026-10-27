/**
 * @file   apps/web/src/game/MatchScreen.tsx
 * @module web/game
 * @brief  A live match for a player or spectator: waiting room, arena, final ranking (WP-12/13).
 *
 * Responsibility: fold the server's live view with the Quick Test's playback logic and
 *                 show: in the lobby, the waiting room with the players and the start
 *                 countdown; while running, the arena — the current number large, recent
 *                 numbers, the player's own cards (taps go to the server), status (points,
 *                 rank, effects, seasons, shield), standings with active players first, the
 *                 prize list in classic types, one match log (newest first), the cut screen
 *                 with the countdown to the next round or "Waiting for the host to start
 *                 round N" (D14) and the recap of the round below it (./Interlude, D20, for
 *                 eliminated players and spectators too), the spectator note once out; at the
 *                 end the final placement on top; a match ended without a result shows its
 *                 own end page (./MatchCancelled, D17). Remounted per match code, so nothing
 *                 of a previous match survives.
 * Depends on:     react, ../playback, ../components/*, ./useLiveMatch, ./LiveCard,
 *                 ./CurrentBall, ./HostLink, ./Interlude, ./WaitingRoom, ./MatchCancelled, ./labels,
 *                 ./EndActions, ./game.css
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/01-game-design.md §3–§13; docs/spec/15-implementation-plan.md WP-12, WP-13
 */
import type { ReactElement } from 'react';

import { CutScreen } from '../components/CutScreen.js';
import { DrawTicker } from '../components/DrawTicker.js';
import { inPlay, ownerRank } from '../components/OwnerArea.js';
import { OwnerStatusPanel } from '../components/OwnerStatusPanel.js';
import { FinalPlacement } from '../components/FinalPlacement.js';
import { MatchLog, PrizeList } from '../components/Playback.js';
import { Standings } from '../components/Standings.js';
import { playbackAt, type PlaybackView } from '../playback.js';
import { CurrentBall } from './CurrentBall.js';
import { EndActions } from './EndActions.js';
import { HostLink } from './HostLink.js';
import { currentRecap, Interlude } from './Interlude.js';
import { progressText, rulesLine } from './labels.js';
import { LiveCard } from './LiveCard.js';
import { MatchCancelled } from './MatchCancelled.js';
import { useLiveMatch, type LiveState } from './useLiveMatch.js';
import { WaitingRoom } from './WaitingRoom.js';
import './game.css';

export function MatchScreen({ code }: { readonly code: string }): ReactElement {
  const { live, error } = useLiveMatch(code);
  if (live === null) {
    return <p className="sbr-muted">{error ?? 'Loading the match…'}</p>;
  }
  const view = playbackAt(live.view, live.view.events.length);
  if (live.match.status === 'lobby') return <WaitingRoom live={live} view={view} />;
  if (live.match.status === 'aborted') return <MatchCancelled live={live} />;
  return <Arena live={live} view={view} />;
}

function Arena({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement {
  const result = live.view;
  const owner = view.owners[0];
  return (
    // data-seq: the server's event number this screen shows (the play-through compares it).
    <div className="arena" data-testid="arena" data-seq={live.seq}>
      <ArenaHeader live={live} view={view} />
      <ArenaNotice live={live} view={view} />
      <div className="arena-grid">
        <section className="arena-play">
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
          {owner !== undefined ? <OwnCards live={live} view={view} /> : <Spectating />}
        </section>
        <aside className="arena-side">
          {owner !== undefined ? (
            <OwnerStatusPanel
              accountId={owner.accountId}
              points={owner.points}
              rank={ownerRank(result, view, owner.accountId)}
              status={view.ownerStatus[owner.accountId] ?? null}
              effectSeasons={result.effectSeasons}
              showSeasons={result.gameType === 'royale'}
              outInCut={owner.eliminatedCut}
            />
          ) : null}
          {result.gameType === 'royale' ? null : <PrizeList result={result} view={view} />}
          {/* At the end the final placement above replaces the live standings. */}
          {view.finished ? null : (
            <Standings view={view} showSeasons={result.gameType === 'royale'} />
          )}
          <MatchLog banners={view.banners} />
        </aside>
      </div>
    </div>
  );
}

// Above the arena: the final placement at the end; otherwise the cut screen, the recap of
// the round just played (D20) and, while the match waits for its host between rounds, the
// waiting notice (D14).
function ArenaNotice({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement {
  if (view.finished) {
    return (
      <>
        <FinalPlacement result={live.view} view={view} />
        <EndActions host={false} code={live.match.code} />
      </>
    );
  }
  const recap = currentRecap(live.view.recaps, view);
  return (
    <>
      <CutScreen cut={view.lastCut} nextRoundAt={live.match.nextRoundAt} />
      {/* The recap of the round just played, below the cut screen (D20). */}
      {recap === null ? null : (
        <Interlude
          key={recap.roundIndex}
          recap={recap}
          pause={live.match.settings.roundPause}
          nextRoundAt={live.match.nextRoundAt}
          me={live.me}
        />
      )}
      {live.match.waitingForHost ? (
        <p className="sbr-panel" role="status" data-testid="waiting-for-host">
          Waiting for the host to start round {view.currentRound + 2}
        </p>
      ) : null}
    </>
  );
}

function OwnCards({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement | null {
  const owner = view.owners[0];
  if (owner === undefined) return <Spectating />;
  if (!inPlay(owner, view)) {
    // Once the match is over there is nothing left to watch.
    return view.finished ? null : (
      <p className="sbr-panel sbr-muted" data-testid="spectator-note">
        You're watching the rest of the match.
      </p>
    );
  }
  const canTap = live.view.markingMode === 'manual' && !owner.eliminated && !view.finished;
  return (
    <div className="own-cards">
      {owner.cards.map((card, cardIndex) => (
        <LiveCard
          key={`${String(view.currentRound)}-${String(cardIndex)}`}
          code={live.match.code}
          cardIndex={cardIndex}
          card={card}
          marks={owner.marks[cardIndex] ?? []}
          draws={view.drawsSoFar}
          roundOver={view.roundOver}
          canTap={canTap}
        />
      ))}
    </div>
  );
}

function Spectating(): ReactElement {
  return (
    <p className="sbr-panel sbr-muted" data-testid="spectating">
      You are watching this match.
    </p>
  );
}

// Title, progress (stage, round, draw), the rules in plain words, host link and LIVE.
function ArenaHeader({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement {
  return (
    <header className="arena-head">
      <div>
        <h1>{live.match.title}</h1>
        <p className="sbr-muted" data-testid="arena-progress">
          {progressText(live, view)}
        </p>
        <p className="sbr-muted">{rulesLine(live.match)}</p>
      </div>
      <div className="sbr-row">
        <HostLink match={live.match} />
        {live.match.status === 'running' ? <span className="sbr-badge-live">LIVE</span> : null}
      </div>
    </header>
  );
}
