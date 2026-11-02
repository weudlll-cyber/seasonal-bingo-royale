/**
 * @file   apps/web/src/game/WatchCards.tsx
 * @module web/game
 * @brief  The live cards a player who is out, or a spectator, watches (D24).
 *
 * Responsibility: "Top 4 still in": the cards of the best players still in as the server
 *                 names them (a phone shows the first 2, ./arena.css), each with place, name and
 *                 points, the marks as they happen (the fold of the public cellMarked events) in
 *                 the look of a player's own card, and "1 to go: <pattern>" from the server. A
 *                 card keeps its slot while its player stays in the set, so the cards do not jump.
 *                 A followed player's card alone and larger with "Back to the top 4"; when that
 *                 player goes out, the top again with a line saying so.
 * Depends on:     react, ../components/CardGrid, ./labels, ../playback, ../types, ./watch.css
 * Used by:        ./MatchScreen
 * Spec:           docs/spec/01-game-design.md §13 (D24)
 */
import { useRef, type ReactElement } from 'react';

import { CardGrid } from '../components/CardGrid.js';
import { prizeName } from './labels.js';
import type { PlaybackView, PlayerView } from '../playback.js';
import type { WatchView } from '../types.js';
import './watch.css';

interface WatchCardsProps {
  readonly watch: WatchView;
  readonly view: PlaybackView;
  // The player this screen follows, null for the top 4.
  readonly followed: string | null;
  readonly onBack: () => void;
}

export function WatchCards({ watch, view, followed, onBack }: WatchCardsProps): ReactElement {
  const slots = useStableSlots(watch.top);
  const target =
    followed === null ? undefined : view.standings.find((p) => p.accountId === followed);
  const following = target !== undefined && !target.eliminated;
  const names = following ? [target.accountId] : slots;
  return (
    <section
      className={`watch-cards${following ? ' is-following' : ''}`}
      data-testid="watch-cards"
      aria-label={following ? `${target.accountId}'s card` : 'The top 4 still in'}
    >
      {followed !== null && !following ? (
        <p className="watch-note" role="status" data-testid="watch-followed-out">
          {followed} is out — back to the top 4
        </p>
      ) : null}
      {following ? (
        <button type="button" className="sbr-btn watch-back" onClick={onBack}>
          Back to the top 4
        </button>
      ) : null}
      <div className="watch-grid">
        {names.map((name) => {
          const player = view.standings.find((p) => p.accountId === name);
          return player === undefined ? null : (
            <WatchedCard
              key={name}
              player={player}
              place={view.standings.indexOf(player) + 1}
              oneToGo={watch.oneToGo[name] ?? []}
            />
          );
        })}
      </div>
    </section>
  );
}

function WatchedCard({
  player,
  place,
  oneToGo,
}: {
  readonly player: PlayerView;
  readonly place: number;
  readonly oneToGo: readonly string[];
}): ReactElement | null {
  const card = player.cards[0];
  if (card === undefined) return null;
  const heading = (
    <p className="watch-head">
      <strong>
        #{String(place)} {player.accountId}
      </strong>{' '}
      · {String(player.points)} pts
      {oneToGo.length > 0 ? (
        <span className="watch-togo"> · 1 to go: {oneToGo.map(prizeName).join(', ')}</span>
      ) : null}
    </p>
  );
  return (
    <div className="live-card watch-card" data-testid={`watch-card-${player.accountId}`}>
      <CardGrid
        accountId={player.accountId}
        card={card}
        marks={player.marks[0] ?? []}
        heading={heading}
      />
    </div>
  );
}

// The watched names in slots: a name keeps its slot while it stays in the set; a new name
// takes a slot that was freed, in the server's order.
function useStableSlots(top: readonly string[]): readonly string[] {
  const held = useRef<readonly string[]>([]);
  const kept = held.current.map((name) => (top.includes(name) ? name : null));
  const fresh = top.filter((name) => !kept.includes(name));
  const next = kept.map((name) => name ?? fresh.shift() ?? null);
  const slots = [...next, ...fresh].filter((name): name is string => name !== null);
  held.current = slots;
  return slots;
}
