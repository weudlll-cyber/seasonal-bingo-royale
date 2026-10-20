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
 * Depends on:     react, ./CardGrid, ./CutScreen, ./DrawTicker, ./OwnerCard,
 *                 ./OwnerStatusPanel, ./Standings, ../playback, ../types, ../useReducedMotion
 * Used by:        ../App
 * Spec:           docs/spec/01-game-design.md §3a, §7, §13; docs/spec/15-implementation-plan.md WP-08
 */
import type { ReactElement } from 'react';

import { CardGrid } from './CardGrid.js';
import { CutScreen } from './CutScreen.js';
import { DrawTicker } from './DrawTicker.js';
import { OwnerCard } from './OwnerCard.js';
import { OwnerStatusPanel } from './OwnerStatusPanel.js';
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
      <Standings view={view} />
      {view.finished ? <FinalPlacement result={result} /> : null}
    </div>
  );
}

function Header({ result, view }: PlaybackProps): ReactElement {
  const stage = result.stagePlan[view.currentStage];
  const showStage = result.gameType === 'royale' && stage !== undefined;
  return (
    <header data-testid="stage-banner">
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

function PrizeList({ result, view }: PlaybackProps): ReactElement {
  return (
    <section>
      <h3 style={{ margin: '0 0 .25rem' }}>Prizes</h3>
      <ul data-testid="prize-list" style={{ margin: 0, paddingLeft: '1.25rem' }}>
        {result.tickedPrizes.map((key) => {
          const win = view.prizeWinners[key];
          return (
            <li key={key} data-testid={`prize-${key}`}>
              {key}:{' '}
              {win === undefined
                ? 'open'
                : `won on draw ${String(win.drawNumber)} by ${win.accountIds.join(', ')}`}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Banners({ banners }: { banners: readonly Banner[] }): ReactElement {
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

function OwnerArea({ result, view }: PlaybackProps): ReactElement {
  if (view.owners.length === 0) return <BotCards view={view} />;
  return (
    <div style={gridStyle}>
      {view.owners.map((owner) => (
        <div key={owner.accountId} style={{ display: 'grid', gap: '0.4rem' }}>
          <OwnerStatusPanel
            accountId={owner.accountId}
            points={owner.points}
            rank={view.standings.indexOf(owner) + 1}
            status={view.ownerStatus[owner.accountId] ?? null}
            effectSeasons={result.effectSeasons}
          />
          {owner.cards.map((card, cardIndex) => (
            <OwnerCard
              // A new round deals a new card: remount so manual marks start fresh.
              key={`${owner.accountId}-${String(view.currentRound)}-${String(cardIndex)}`}
              accountId={owner.accountId}
              card={card}
              serverMarks={owner.marks[cardIndex] ?? []}
              result={result}
              drawsSoFar={view.drawsSoFar}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// No owner card in this run: show a few bot cards read-only.
function BotCards({ view }: { view: PlaybackView }): ReactElement {
  return (
    <div style={gridStyle}>
      {view.standings.slice(0, 4).map((bot) => (
        <CardGrid
          key={bot.accountId}
          accountId={bot.accountId}
          card={bot.cards[0] ?? { cells: [], seasonCells: null }}
          marks={bot.marks[0] ?? []}
        />
      ))}
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
  gap: '1rem',
};

function FinalPlacement({ result }: { result: QuickTestResult }): ReactElement {
  const sorted = [...result.players].sort((a, b) => a.place - b.place);
  return (
    <section data-testid="final-placement">
      <h3 style={{ margin: '0 0 .25rem' }}>Final placement</h3>
      <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
        {sorted.slice(0, 20).map((p) => (
          <li
            key={p.accountId}
            data-testid={`final-row-${String(p.place)}`}
            style={{ color: p.isOwner ? '#afb84e' : '#dfe6ee' }}
          >
            #{p.place} {p.accountId} — {String(p.points)} pts
          </li>
        ))}
      </ol>
    </section>
  );
}
