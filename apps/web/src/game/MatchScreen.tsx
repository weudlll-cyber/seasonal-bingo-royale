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
 *                 prize list in classic types, the cut screen, the spectator note once out;
 *                 at the end the final ranking. Remounted per match code, so nothing of a
 *                 previous match survives.
 * Depends on:     react, ../playback, ../components/*, ./useLiveMatch, ./LiveCard, ./CurrentBall
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/01-game-design.md §3–§13; docs/spec/15-implementation-plan.md WP-12, WP-13
 */
import type { ReactElement } from 'react';

import { CutScreen } from '../components/CutScreen.js';
import { DrawTicker } from '../components/DrawTicker.js';
import { inPlay, ownerRank } from '../components/OwnerArea.js';
import { OwnerStatusPanel } from '../components/OwnerStatusPanel.js';
import { Banners, FinalPlacement, MatchLog, PrizeList } from '../components/Playback.js';
import { Standings } from '../components/Standings.js';
import { playbackAt, type PlaybackView } from '../playback.js';
import { CurrentBall } from './CurrentBall.js';
import { gameTypeName, rulesLine } from './labels.js';
import { LiveCard } from './LiveCard.js';
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
  const stage = result.stagePlan[view.currentStage];
  return (
    <div className="arena" data-testid="arena">
      <header className="arena-head">
        <div>
          <h1>{live.match.title}</h1>
          <p className="sbr-muted" data-testid="arena-progress">
            {gameTypeName(result.gameType)}
            {result.gameType === 'royale' && stage !== undefined
              ? ` · stage ${String(view.currentStage + 1)} (${stage.kind})`
              : ''}{' '}
            · round {String(view.currentRound + 1)} · draw {String(view.drawsSoFar.length)}
          </p>
          <p className="sbr-muted">{rulesLine(live.match)}</p>
        </div>
        {live.match.status === 'running' ? <span className="sbr-badge-live">LIVE</span> : null}
      </header>
      <CutScreen cut={view.lastCut} />
      <div className="arena-grid">
        <section className="arena-play">
          <CurrentBall
            draws={view.drawsSoFar}
            speedWindowMs={result.speedWindowMs}
            roundOver={view.roundOver}
          />
          <DrawTicker draws={view.drawsSoFar} speedWindowMs={result.speedWindowMs} />
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
              eliminated={owner.eliminated}
            />
          ) : null}
          {result.gameType === 'royale' ? null : <PrizeList result={result} view={view} />}
          <Standings view={view} showSeasons={result.gameType === 'royale'} />
          <Banners banners={view.banners} />
        </aside>
      </div>
      {view.finished ? <FinalPlacement result={result} view={view} /> : null}
      <MatchLog banners={view.banners} />
    </div>
  );
}

function OwnCards({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement {
  const owner = view.owners[0];
  if (owner === undefined) return <Spectating />;
  if (!inPlay(owner, view)) {
    return (
      <p className="sbr-panel" data-testid="spectator-note">
        You were eliminated – keep watching as a spectator.
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
