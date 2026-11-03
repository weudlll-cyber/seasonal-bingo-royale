/**
 * @file   apps/web/src/game/ArenaCards.tsx
 * @module web/game
 * @brief  The cards in the arena (./MatchScreen): the player's own, or the ones a watcher follows.
 *
 * Responsibility: a player still in sees their cards with taps sent to the server (./LiveCard;
 *                 manual marking only, not once out or at the end); a player out or a spectator
 *                 sees the top 4 still in or one followed player (./WatchCards, D24), before the
 *                 server names any a plain note, nothing once the match is over. Display only.
 * Depends on:     react, ../playback (types), ./LiveCard, ./WatchCards, ./useLiveMatch (types)
 * Used by:        ./MatchScreen
 * Spec:           docs/spec/01-game-design.md §6, §13 (D24)
 */
import type { ReactElement } from 'react';

import type { PlaybackView } from '../playback.js';
import { LiveCard } from './LiveCard.js';
import type { LiveState } from './useLiveMatch.js';
import { WatchCards } from './WatchCards.js';

// The cards a player out or a spectator watches (D24); before the server names any (no
// round yet) a plain note; nothing once the match is over.
export function Watching({
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

export function OwnCards({
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
