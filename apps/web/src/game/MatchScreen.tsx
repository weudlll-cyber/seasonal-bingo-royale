/**
 * @file   apps/web/src/game/MatchScreen.tsx
 * @module web/game
 * @brief  A live match for a player or spectator: waiting room, arena, final ranking (WP-12/13).
 *
 * Responsibility: fold the server's live view with the Quick Test playback logic and show: the
 *                 lobby waiting room (players, start countdown); the arena, filling the window
 *                 during a round on desktop (current number large, recent numbers, the newest 3
 *                 event lines with the whole log one click away, the cards (./ArenaCards: own
 *                 cards with taps, or for a player out or a spectator the top 4 still in or one
 *                 followed player, D24); beside them the status in sentences, patterns this
 *                 round, classic prize list, the standings in a bounded panel); above it
 *                 ./ArenaNotice (final placement, cut screen, the final's fresh start, the round
 *                 recap, quiet hours, waiting for the host); names link to profiles;
 *                 ./MatchCancelled (D17); in an asynchronous match "While you were away" on top
 *                 (./AwaySummary, 01 §11). Remounted per code.
 * Depends on:     react, ../playback, ../components/*, ./useLiveMatch, ./ArenaCards,
 *                 ./ArenaNotice, ./AwaySummary, ./CurrentBall, ./HostLink, ./WaitingRoom,
 *                 ./MatchCancelled, ./labels, ../league/playerHref, ./arena.css, ./game.css
 * Used by:        ../shell/AppShell; BallAndNumbers also by ../host/HostConsole
 * Spec:           docs/spec/01-game-design.md §3–§13; docs/spec/15-implementation-plan.md WP-12, WP-13
 */
import { useState, type ReactElement } from 'react';

import { DrawTicker } from '../components/DrawTicker.js';
import { inPlay, OwnerStatusFor } from '../components/OwnerArea.js';
import { PatternsPanel } from '../components/PatternsPanel.js';
import { PrizeList } from '../components/Playback.js';
import { RecentEvents } from '../components/RecentEvents.js';
import { Standings } from '../components/Standings.js';
import { playerHref } from '../league/playerHref.js';
import { playbackAt, type PlaybackView } from '../playback.js';
import { OwnCards, Watching } from './ArenaCards.js';
import { ArenaNotice } from './ArenaNotice.js';
import { AwaySummary } from './AwaySummary.js';
import { CurrentBall } from './CurrentBall.js';
import { HostLink } from './HostLink.js';
import { progressText, rulesLine, runningBadge } from './labels.js';
import { MatchCancelled } from './MatchCancelled.js';
import { useLiveMatch, type LiveState } from './useLiveMatch.js';
import { WaitingRoom } from './WaitingRoom.js';
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
