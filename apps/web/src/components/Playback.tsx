/**
 * @file   apps/web/src/components/Playback.tsx
 * @module web
 * @brief  Match view: stage banner, cut screen, draws, owner cards and status (WP-08).
 *
 * Responsibility: present the match the owner plays or watches. Royale: stage and round
 *                 header, cut screen, spectator note once eliminated. Classic types:
 *                 prize list with winners. Always: banners, draw ticker, the owner's
 *                 cards and status, standings, final placement. State lives in App.tsx,
 *                 the view-model in ../playback.ts.
 * Depends on:     react, ./CutScreen, ./DrawTicker, ./FinalPlacement, ./OwnerArea, ./Standings,
 *                 ../game/labels, ../playback, ../types, ../useReducedMotion, ./results.css
 * Used by:        ../App; MatchLog and PrizeList also by the live match screens (../game,
 *                 ../host)
 * Spec:           docs/spec/01-game-design.md §3a, §7, §13; docs/spec/15-implementation-plan.md WP-08
 */
import type { ReactElement } from 'react';

import { CutScreen } from './CutScreen.js';
import { DrawTicker } from './DrawTicker.js';
import { FinalPlacement } from './FinalPlacement.js';
import { OwnerArea } from './OwnerArea.js';
import { Standings } from './Standings.js';
import { gameTypeName, prizeName } from '../game/labels.js';
import type { Banner, PlaybackView } from '../playback.js';
import type { QuickTestResult } from '../types.js';
import { useReducedMotion } from '../useReducedMotion.js';
import './results.css';

export interface PlaybackProps {
  readonly result: QuickTestResult;
  readonly view: PlaybackView;
}

export function Playback({ result, view }: PlaybackProps): ReactElement {
  const allOut = view.owners.length > 0 && view.owners.every((o) => o.eliminated);
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <Header result={result} view={view} />
      <CutScreen cut={view.lastCut} />
      {allOut && !view.finished ? (
        <p data-testid="spectator-note" style={{ color: '#9aa5b2', margin: 0 }}>
          You were eliminated – keep watching as a spectator.
        </p>
      ) : null}
      {result.gameType === 'royale' ? null : <PrizeList result={result} view={view} />}
      <Banners banners={view.banners} />
      <DrawTicker draws={view.drawsSoFar} speedWindowMs={result.speedWindowMs} />
      <OwnerArea result={result} view={view} />
      <Standings view={view} showSeasons={result.gameType === 'royale'} />
      {view.finished ? <FinalPlacement result={result} view={view} /> : null}
      <MatchLog banners={view.banners} />
    </div>
  );
}

// Every key moment of the match so far, newest first; hidden while there is none yet.
export function MatchLog({ banners }: { banners: readonly Banner[] }): ReactElement | null {
  if (banners.length === 0) return null;
  return (
    <section className="sbr-panel match-log" data-testid="match-log">
      <h3>Match log</h3>
      <ol aria-live="polite">
        {[...banners].reverse().map((b) => (
          <li key={b.key}>{b.text}</li>
        ))}
      </ol>
    </section>
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
      <p style={{ margin: 0, color: '#9aa5b2' }}>
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

export function Banners({ banners }: { banners: readonly Banner[] }): ReactElement {
  const reduced = useReducedMotion();
  return (
    <ul
      aria-live="polite"
      data-testid="banners"
      style={{ margin: 0, padding: 0, listStyle: 'none', color: '#dfe6ee' }}
    >
      {banners.slice(-6).map((b) => (
        <li
          key={b.key}
          className={reduced ? undefined : 'sbr-anim-fade'}
          style={{
            padding: '0.25rem 0.5rem',
            background: '#1a2130',
            borderRadius: '0.3rem',
            marginBottom: '0.2rem',
          }}
        >
          {b.text}
        </li>
      ))}
    </ul>
  );
}
