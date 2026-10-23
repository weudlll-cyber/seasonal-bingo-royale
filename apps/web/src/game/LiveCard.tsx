/**
 * @file   apps/web/src/game/LiveCard.tsx
 * @module web/game
 * @brief  The player's own card in a live match: the server's marks, taps sent as intents.
 *
 * Responsibility: render the card with the Quick Test's TapGrid (B I N G O header, sorted
 *                 columns, season cells, "G 52" names, keyboard taps). The marks shown are
 *                 the server's; a tap on a drawn number goes to the gateway as a `mark`
 *                 intent and the answer becomes the feedback line ("Marked G 52", or why not
 *                 in plain words).
 *                 Taps on undrawn numbers and after the round end are answered here
 *                 without a round trip (the server would refuse them too, 01 §6).
 * Depends on:     react, ../components/OwnerCard (TapGrid), ./socket, ../types, ./labels
 * Used by:        ./MatchScreen
 * Spec:           docs/spec/01-game-design.md §4, §6, §13; docs/spec/06-realtime-architecture.md §4.1
 */
import { useState, type ReactElement } from 'react';

import { TapGrid } from '../components/OwnerCard.js';
import { ballLabel, type Card } from '../types.js';
import { problemText } from './labels.js';
import { intent } from './socket.js';

interface LiveCardProps {
  readonly code: string;
  readonly cardIndex: number;
  readonly card: Card;
  readonly marks: readonly boolean[];
  readonly draws: readonly number[];
  readonly roundOver: boolean;
  readonly canTap: boolean;
}

export function LiveCard(props: LiveCardProps): ReactElement {
  const { code, cardIndex, card, marks, draws, roundOver, canTap } = props;
  const [feedback, setFeedback] = useState('Tap a drawn number on your card.');
  const [lastTapped, setLastTapped] = useState<number | null>(null);
  const tap = (cell: number): void => {
    const c = card.cells[cell];
    if (!canTap || c === undefined || c.kind === 'free' || marks[cell] === true) return;
    if (roundOver) {
      setFeedback('Round over — no more taps');
      return;
    }
    if (!draws.includes(c.value)) {
      setFeedback('Not drawn yet — refused');
      return;
    }
    setLastTapped(cell);
    void intent('mark', { code, cardIndex, cell }).then((answer) => {
      // Names the number, e.g. "Marked G 52"; a refusal in plain words.
      const label = ballLabel(c.value);
      setFeedback(
        answer.ok ? `Marked ${label}` : `Not marked ${label}: ${problemText(answer.code)}`,
      );
    });
  };
  return (
    <section className="live-card" aria-label={`Your card ${String(cardIndex + 1)}`}>
      <TapGrid card={card} marks={marks} lastTapped={lastTapped} onTap={tap} />
      {canTap ? (
        <p className="live-card-feedback" role="status" data-testid="card-feedback">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
