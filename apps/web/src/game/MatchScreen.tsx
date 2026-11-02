/**
 * @file   apps/web/src/game/MatchScreen.tsx
 * @module web/game
 * @brief  A live match for a player or spectator: waiting room, arena, final ranking (WP-12/13).
 *
 * Responsibility: fold the server's live view with the Quick Test playback logic and show: the
 *                 lobby waiting room (players, start countdown); the arena, filling the window
 *                 during a round on desktop (current number large, recent numbers, the newest 3
 *                 event lines with the whole log one click away, own cards with taps sent to the
 *                 server; beside them the status in sentences, patterns this round, classic prize
 *                 list, the standings in a bounded panel); for a player out or a spectator the
 *                 top 4 still in or one followed player (./WatchCards, D24); the cut screen with
 *                 the next-round countdown or "Waiting for the host to start round N" (D14), the
 *                 final's fresh start (D23) over the round recap (./Interlude, D20); the final
 *                 placement on top; names link to profiles; ./MatchCancelled (D17); in an
 *                 asynchronous match "While you were away" on top (./AwaySummary) and the
 *                 quiet-hours notice (01 §5, §11). Remounted per code.
 * Depends on:     react, ../playback, ../components/*, ./useLiveMatch, ./LiveCard, ./AwaySummary,
 *                 ./CurrentBall, ./HostLink, ./Interlude, ./WaitingRoom, ./MatchCancelled, ./labels,
 *                 ./Registration (whenText), ./EndActions, ./WatchCards, ../league/playerHref,
 *                 ./arena.css, ./game.css
 * Used by:        ../shell/AppShell; BallAndNumbers also by ../host/HostConsole
 * Spec:           docs/spec/01-game-design.md §3–§13; docs/spec/15-implementation-plan.md WP-12, WP-13
 */
import { useState, type ReactElement } from 'react';

import { CutScreen } from '../components/CutScreen.js';
import { DrawTicker } from '../components/DrawTicker.js';
import { FinalNotice } from '../components/FinalNotice.js';
import { inPlay, OwnerStatusFor } from '../components/OwnerArea.js';
import { FinalPlacement } from '../components/FinalPlacement.js';
import { PatternsPanel } from '../components/PatternsPanel.js';
import { PrizeList } from '../components/Playback.js';
import { RecentEvents } from '../components/RecentEvents.js';
import { Standings } from '../components/Standings.js';
import { playerHref } from '../league/playerHref.js';
import { playbackAt, type PlaybackView } from '../playback.js';
import { AwaySummary } from './AwaySummary.js';
import { CurrentBall } from './CurrentBall.js';
import { EndActions } from './EndActions.js';
import { HostLink } from './HostLink.js';
import { currentRecap, Interlude } from './Interlude.js';
import { progressText, rulesLine, runningBadge } from './labels.js';
import { LiveCard } from './LiveCard.js';
import { MatchCancelled } from './MatchCancelled.js';
import { whenText } from './Registration.js';
import { useLiveMatch, type LiveState } from './useLiveMatch.js';
import { WaitingRoom } from './WaitingRoom.js';
import { WatchCards } from './WatchCards.js';
import './arena.css';
import './game.css';

export function MatchScreen({ code }: { readonly code: string }): ReactElement {
  const { live, error, follow } = useLiveMatch(code);
  if (live === null) {
    return <p className="sbr-muted">{error ?? 'Loading the match…'}</p>;
  }
  const view = playbackAt(live.view, live.view.events.length);
  if (live.match.status === 'lobby') return <WaitingRoom live={live} view={view} />;
  if (live.match.status === 'aborted') return <MatchCancelled live={live} />;
  return <Arena live={live} view={view} follow={follow} />;
}

interface ArenaProps {
  readonly live: LiveState;
  readonly view: PlaybackView;
  // A watching screen follows one player still in, or the top 4 again (D24).
  readonly follow: (name: string | null) => void;
}

function Arena({ live, view, follow }: ArenaProps): ReactElement {
  const result = live.view;
  const owner = view.owners[0];
  // A player out (after the round of their cut) or a spectator watches the top 4 (D24).
  const watching = owner === undefined || !inPlay(owner, view);
  const [followed, setFollowed] = useState<string | null>(null);
  const choose = (name: string | null): void => {
    setFollowed(name);
    follow(name);
  };
  return (
    // data-seq: the server's event number this screen shows (the play-through compares it).
    // fit-window: during a round the arena fills the window below the top bar (shell.css).
    <div className="arena fit-window" data-testid="arena" data-seq={live.seq}>
      <ArenaHeader live={live} view={view} />
      {/* Under the title on desktop, below the play area on a phone (arena.css). */}
      <p className="sbr-muted arena-rules">{rulesLine(live.match)}</p>
      {/* An asynchronous match tells a returning player what happened (01 §11). */}
      {live.match.mode === 'async' ? <AwaySummary code={live.match.code} /> : null}
      <ArenaNotice live={live} view={view} />
      <div className="arena-grid">
        {/* Ball, drawn numbers, the newest lines and the whole card (or the watched cards)
            in view at once (arena.css). */}
        <section className="arena-play">
          <BallAndNumbers result={result} view={view} />
          <div className="arena-cards">
            {watching ? (
              <Watching
                live={live}
                view={view}
                followed={followed}
                onBack={() => {
                  choose(null);
                }}
              />
            ) : (
              <OwnCards live={live} view={view} />
            )}
          </div>
        </section>
        <aside className="arena-side">
          {owner !== undefined ? (
            <OwnerStatusFor result={result} view={view} owner={owner} />
          ) : null}
          {result.gameType === 'royale' ? <PatternsPanel result={result} view={view} /> : null}
          {result.gameType === 'royale' ? null : <PrizeList result={result} view={view} />}
          {/* At the end the final placement above replaces the live standings. */}
          {view.finished ? null : (
            <Standings
              result={result}
              view={view}
              onFollow={watching ? choose : undefined}
              profileHref={playerHref}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

// The current number, the drawn numbers and the newest event lines (the whole log one
// click away); the host console shows the same.
export function BallAndNumbers({
  result,
  view,
}: {
  readonly result: LiveState['view'];
  readonly view: PlaybackView;
}): ReactElement {
  // Automatic marking (asynchronous matches, 01 §6, §11) has no taps: no speed window.
  const tapping = result.markingMode !== 'auto';
  return (
    <>
      <div className="arena-ball">
        <CurrentBall
          draws={view.drawsSoFar}
          speedWindowMs={result.speedWindowMs}
          showWindow={tapping}
          roundOver={view.roundOver}
          finished={view.finished}
        />
      </div>
      <div className="arena-ticker">
        <DrawTicker
          draws={view.drawsSoFar}
          speedWindowMs={result.speedWindowMs}
          showWindow={tapping && !view.finished}
          paused={view.roundOver && !view.finished}
        />
      </div>
      <div className="arena-events">
        <RecentEvents banners={view.banners} />
      </div>
    </>
  );
}

// Above the arena: the final placement at the end; otherwise the cut screen (a survivor's
// goes once the next round draws), the final's fresh start (D23), the recap of the round
// just played (D20) and, while the match waits for its host between rounds, the waiting
// notice (D14).
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
        <FinalPlacement result={live.view} view={view} profileHref={playerHref} />
        <EndActions host={false} code={live.match.code} />
      </>
    );
  }
  const recap = currentRecap(live.view.recaps, view);
  const cut = view.lastCut;
  const survivedEarlier =
    cut !== null &&
    cut.round < view.currentRound &&
    view.drawsSoFar.length > 0 &&
    cut.owners.every((o) => o.outcome !== 'eliminated');
  return (
    <>
      {survivedEarlier ? null : <CutScreen cut={cut} nextRoundAt={live.match.nextRoundAt} />}
      <FinalNotice result={live.view} view={view} />
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
      {live.match.quietUntil !== null ? (
        <p className="sbr-panel" role="status" data-testid="quiet-hours">
          Quiet hours — the next number comes {whenText(live.match.quietUntil, Date.now())}.
        </p>
      ) : null}
      {live.match.waitingForHost ? (
        <p className="sbr-panel" role="status" data-testid="waiting-for-host">
          Waiting for the host to start round {view.currentRound + 2}
        </p>
      ) : null}
    </>
  );
}

// The cards a player out or a spectator watches (D24); before the server names any (no
// round yet) a plain note; nothing once the match is over.
function Watching({
  live,
  view,
  followed,
  onBack,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
  readonly followed: string | null;
  readonly onBack: () => void;
}): ReactElement | null {
  if (view.finished) return null;
  const watch = live.view.watch;
  if (watch === undefined || watch.top.length === 0) {
    return (
      <p className="sbr-panel sbr-muted" data-testid="spectating">
        You are watching this match.
      </p>
    );
  }
  return <WatchCards watch={watch} view={view} followed={followed} onBack={onBack} />;
}

function OwnCards({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement | null {
  const owner = view.owners[0];
  if (owner === undefined) return null;
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

// Title, progress (stage, round, draw), host link and LIVE; the rules line follows it.
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
      </div>
      <div className="sbr-row">
        <HostLink match={live.match} />
        {live.match.status === 'running' ? (
          <span className="sbr-badge-live">{runningBadge(live.match.mode)}</span>
        ) : null}
      </div>
    </header>
  );
}
