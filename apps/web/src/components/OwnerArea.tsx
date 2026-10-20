/**
 * @file   apps/web/src/components/OwnerArea.tsx
 * @module web
 * @brief  The owner's status panels and cards, or a few bot cards without an owner (WP-08).
 *
 * Responsibility: per owner account, the status panel (server points and rank, effects,
 *                 seasons) above that owner's cards. When the owner taps, the seasons
 *                 shown are those marked on the owner's own cards, collected over the
 *                 rounds, and a note states the Quick Test limitation: the match is
 *                 computed on the server before playback, so points, standings and cuts
 *                 count the owner's cards as marked after the delay (01 §6). Without an
 *                 owner card, shows the first bot cards read-only.
 * Depends on:     react, ./CardGrid, ./OwnerCard, ./OwnerStatusPanel, ../playback, ../types
 * Used by:        ./Playback
 * Spec:           docs/spec/01-game-design.md §6, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { useCallback, useState, type ReactElement } from 'react';

import { CardGrid } from './CardGrid.js';
import { OwnerCard } from './OwnerCard.js';
import { OwnerStatusPanel } from './OwnerStatusPanel.js';
import type { PlaybackView } from '../playback.js';
import { SEASON_NAMES, type QuickTestResult, type Season } from '../types.js';

export interface OwnerAreaProps {
  readonly result: QuickTestResult;
  readonly view: PlaybackView;
}

// During play: the live standings rank. Once the match is finished: the place in the
// final placement, so the panel and the final list never disagree.
function ownerRank(result: QuickTestResult, view: PlaybackView, accountId: string): number {
  const place = result.players.find((p) => p.accountId === accountId)?.place;
  if (view.finished && place !== undefined) return place;
  return view.standings.findIndex((p) => p.accountId === accountId) + 1;
}

export function OwnerArea({ result, view }: OwnerAreaProps): ReactElement {
  const tapping = result.markingMode === 'manual';
  const [cardSeasons, addSeasons] = useCardSeasons();
  if (view.owners.length === 0) return <BotCards view={view} />;
  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {tapping ? <LimitationNote result={result} /> : null}
      <div style={gridStyle}>
        {view.owners.map((owner) => (
          <div key={owner.accountId} style={{ display: 'grid', gap: '0.4rem' }}>
            <OwnerStatusPanel
              accountId={owner.accountId}
              points={owner.points}
              rank={ownerRank(result, view, owner.accountId)}
              status={view.ownerStatus[owner.accountId] ?? null}
              effectSeasons={result.effectSeasons}
              showSeasons={result.gameType === 'royale'}
              cardSeasons={tapping ? (cardSeasons[owner.accountId] ?? []) : undefined}
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
                onMarkedSeasons={(seasons) => {
                  addSeasons(owner.accountId, seasons);
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Seasons marked on each owner's cards so far in this run (seasons are collected per
// match, 01 §8.3). Only grows; the state updates only when a season is new.
function useCardSeasons(): [
  Readonly<Record<string, readonly Season[]>>,
  (accountId: string, seasons: readonly Season[]) => void,
] {
  const [byOwner, setByOwner] = useState<Readonly<Record<string, readonly Season[]>>>({});
  const add = useCallback((accountId: string, seasons: readonly Season[]) => {
    setByOwner((prev) => {
      const known = prev[accountId] ?? [];
      if (seasons.every((s) => known.includes(s))) return prev;
      const merged = SEASON_NAMES.filter((s) => known.includes(s) || seasons.includes(s));
      return { ...prev, [accountId]: merged };
    });
  }, []);
  return [byOwner, add];
}

function LimitationNote({ result }: { result: QuickTestResult }): ReactElement {
  const delay = `${String(result.ownerAutoMarkDelayMs / 1000)} s`;
  const shows =
    result.missedNumbers.kind === 'autoMarkAfter'
      ? `what you tapped and what was marked for you after ${delay}`
      : 'only what you tapped';
  return (
    <p
      data-testid="quicktest-limitation"
      style={{ margin: 0, color: '#9aa5b2', fontSize: '0.9rem' }}
    >
      Quick Test: the match is computed on the server before playback, so it cannot know your taps.
      Your points, the standings and the cuts count your cards as if each number were marked for you{' '}
      {delay} after its draw. Your card shows {shows}.
    </p>
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
