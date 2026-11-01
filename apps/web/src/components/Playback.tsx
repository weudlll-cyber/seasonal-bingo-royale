/**
 * @file   apps/web/src/components/Playback.tsx
 * @module web
 * @brief  Match view: stage banner, cut screen, draws, owner cards and status (WP-08).
 *
 * Responsibility: present the match the owner plays or watches. Royale: stage and round
 *                 header, cut screen and the round recap after it (../game/Interlude, D20),
 *                 spectator note once eliminated. Classic types:
 *                 prize list with winners. Always: the newest event lines with the whole log
 *                 (./RecentEvents), draw ticker, the owner's cards and status, standings,
 *                 final placement. State lives in ../quicktest/Simulation,
 *                 the view-model in ../playback.ts.
 * Depends on:     react, ./CutScreen, ../game/Interlude, ../game/interludePlan (types),
 *                 ./DrawTicker, ./FinalPlacement, ./OwnerArea, ./RecentEvents, ./Standings,
 *                 ../game/labels, ../playback, ../types, ./results.css
 * Used by:        ../quicktest/Simulation, ./FinalPlacement; PrizeList also by the live screens
 *                 ../game/MatchScreen and ../host/HostConsole
 * Spec:           docs/spec/01-game-design.md §3a, §7, §13; docs/spec/15-implementation-plan.md WP-08
 */
import type { ReactElement } from 'react';

import { CutScreen } from './CutScreen.js';
import { currentRecap, Interlude } from '../game/Interlude.js';
import type { Pause } from '../game/interludePlan.js';
import { DrawTicker } from './DrawTicker.js';
import { FinalPlacement } from './FinalPlacement.js';
import { OwnerArea } from './OwnerArea.js';
import { RecentEvents } from './RecentEvents.js';
import { Standings } from './Standings.js';
import { gameTypeName, prizeName } from '../game/labels.js';
import type { PlaybackView } from '../playback.js';
import type { QuickTestResult } from '../types.js';
import './results.css';

export interface PlaybackProps {
  readonly result: QuickTestResult;
  readonly view: PlaybackView;
}

// The Quick Test's pause after a royale round: the next draw's interval, or until the
// owner presses Draw next (host draws).
export function Playback({
  result,
  view,
  pause = { kind: 'host' },
}: PlaybackProps & { readonly pause?: Pause }): ReactElement {
  const allOut = view.owners.length > 0 && view.owners.every((o) => o.eliminated);
  const recap = currentRecap(result.recaps, view);
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <Header result={result} view={view} />
      <CutScreen cut={view.lastCut} />
      {/* The same recap as a live match, from the same server builder (D20). */}
      {recap === null ? null : (
        <Interlude
          key={recap.roundIndex}
          recap={recap}
          pause={pause}
          nextRoundAt={null}
          me={view.owners[0]?.accountId ?? null}
        />
      )}
      {allOut && !view.finished ? (
        <p data-testid="spectator-note" style={{ color: 'var(--color-text-muted)', margin: 0 }}>
          You were eliminated – keep watching as a spectator.
        </p>
      ) : null}
      {result.gameType === 'royale' ? null : <PrizeList result={result} view={view} />}
      <RecentEvents banners={view.banners} />
      <DrawTicker
        draws={view.drawsSoFar}
        speedWindowMs={result.speedWindowMs}
        paused={view.roundOver && !view.finished}
      />
      <OwnerArea result={result} view={view} />
      <Standings result={result} view={view} />
      {view.finished ? <FinalPlacement result={result} view={view} /> : null}
    </div>
  );
}

function Header({ result, view }: PlaybackProps): ReactElement {
  const stage = result.stagePlan[view.currentStage];
  const showStage = result.gameType === 'royale' && stage !== undefined;
  return (
    <header
      data-testid="stage-banner"
      data-round={view.currentRound}
      data-draws={view.drawsSoFar.length}
      data-round-over={view.roundOver ? 'true' : 'false'}
    >
      <h2 style={{ margin: '0 0 .25rem' }}>
        {gameTypeName(result.gameType)}
        {showStage ? ` — stage ${String(view.currentStage + 1)} (${stage.kind})` : ''}
      </h2>
      <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
        round {String(view.currentRound + 1)} · draw {String(view.drawsSoFar.length)} /{' '}
        {String(view.totalDraws)}
      </p>
    </header>
  );
}

// One row per ticked prize: its name, then "open" or the winners and the deciding draw.
export function PrizeList({ result, view }: PlaybackProps): ReactElement {
  return (
    <section className="sbr-panel">
      <h3>Prizes</h3>
      <ul className="prize-rows" data-testid="prize-list">
        {result.tickedPrizes.map((key) => {
          const win = view.prizeWinners[key];
          return (
            <li key={key} data-testid={`prize-${key}`} className={win ? 'is-won' : undefined}>
              <span className="prize-name">{prizeName(key)}</span>
              {win === undefined ? (
                <span className="prize-open">Open</span>
              ) : (
                <span className="prize-winners">
                  <strong>{win.accountIds.join(', ')}</strong>
                  <span className="sbr-muted"> · {win.decided}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
