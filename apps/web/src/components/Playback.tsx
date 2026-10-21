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
 * Depends on:     react, ./CutScreen, ./DrawTicker, ./OwnerArea, ./Standings,
 *                 ../playback, ../types, ../useReducedMotion
 * Used by:        ../App; MatchLog, PrizeList, Banners and FinalPlacement also by the live
 *                 match screens (../game, ../host)
 * Spec:           docs/spec/01-game-design.md §3a, §7, §13; docs/spec/15-implementation-plan.md WP-08
 */
import type { ReactElement } from 'react';

import { CutScreen } from './CutScreen.js';
import { DrawTicker } from './DrawTicker.js';
import { OwnerArea } from './OwnerArea.js';
import { Standings } from './Standings.js';
import type { Banner, PlaybackView } from '../playback.js';
import type { QuickTestResult } from '../types.js';
import { useReducedMotion } from '../useReducedMotion.js';

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

// Every key moment of the match so far, oldest first; the banner list above shows only
// the latest six.
export function MatchLog({ banners }: { banners: readonly Banner[] }): ReactElement {
  return (
    <details open data-testid="match-log">
      <summary>Match log ({String(banners.length)})</summary>
      <ol style={{ margin: 0, paddingLeft: '1.25rem', color: '#9aa5b2' }}>
        {banners.map((b) => (
          <li key={b.key}>{b.text}</li>
        ))}
      </ol>
    </details>
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
        {result.gameType}
        {showStage ? ` — stage ${String(view.currentStage + 1)} (${stage.kind})` : ''}
      </h2>
      <p style={{ margin: 0, color: '#9aa5b2' }}>
        round {String(view.currentRound + 1)} · draw {String(view.drawsSoFar.length)} /{' '}
        {String(view.totalDraws)}
      </p>
    </header>
  );
}

export function PrizeList({ result, view }: PlaybackProps): ReactElement {
  return (
    <section>
      <h3 style={{ margin: '0 0 .25rem' }}>Prizes</h3>
      <ul data-testid="prize-list" style={{ margin: 0, paddingLeft: '1.25rem' }}>
        {result.tickedPrizes.map((key) => {
          const win = view.prizeWinners[key];
          return (
            <li key={key} data-testid={`prize-${key}`}>
              {key}:{' '}
              {win === undefined ? 'open' : `won on ${win.decided} by ${win.accountIds.join(', ')}`}
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

// Top 20 plus the owner's rows; eliminated players are ranked by when they went out
// (01 §7.5) and show their score at elimination with "out".
export function FinalPlacement({ result, view }: PlaybackProps): ReactElement {
  const out = new Set(view.standings.filter((p) => p.eliminated).map((p) => p.accountId));
  const sorted = [...result.players].sort((a, b) => a.place - b.place);
  const shown = sorted.filter((p, i) => i < 20 || p.isOwner);
  return (
    <section data-testid="final-placement">
      <h3 style={{ margin: '0 0 .25rem' }}>Final placement</h3>
      <ol style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'none' }}>
        {shown.map((p) => (
          <li
            key={p.accountId}
            data-testid={`final-row-${String(p.place)}`}
            style={{ color: p.isOwner ? '#afb84e' : '#dfe6ee' }}
          >
            #{p.place} {p.accountId} — {finalNote(result, view, p, out)}
          </li>
        ))}
      </ol>
    </section>
  );
}

// Royale: points, or "out" for eliminated players. Classic types rank by prizes
// (01 §3a.2), so the row lists the prizes won.
function finalNote(
  result: QuickTestResult,
  view: PlaybackView,
  p: QuickTestResult['players'][number],
  out: ReadonlySet<string>,
): string {
  // Eliminated players keep the score they had when they went out (01 §7.5).
  if (result.gameType === 'royale') {
    return `${String(p.points)} pts${out.has(p.accountId) ? ' · out' : ''}`;
  }
  const won = result.tickedPrizes.filter((k) =>
    view.prizeWinners[k]?.accountIds.includes(p.accountId),
  );
  return won.length === 0 ? 'no prize' : won.join(', ');
}
