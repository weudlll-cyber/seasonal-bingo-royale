/**
 * @file   apps/web/src/game/Interlude.tsx
 * @module web/game
 * @brief  The interlude between royale rounds: the recap of the round just played as a card sequence (D20).
 *
 * Responsibility: during the pause after a royale round, for players, eliminated players,
 *                 spectators and the host: the server's recap as 3–5 cards (./interludePlan
 *                 chooses them and their time) that advance by themselves and can be stepped
 *                 with Previous and Next; a timed pause ends with "Next round in N s", a pause
 *                 the host ends loops the cards until the next round starts. The cut screen
 *                 (D15) stays above it. Motion is a fade that switches off under
 *                 prefers-reduced-motion. Fun only: it shows what the server sent and changes
 *                 nothing.
 * Depends on:     react, @sbr/contracts (types), ../playback (types), ../useReducedMotion,
 *                 ../useSecondsUntil, ./interludePlan, ./InterludeCards, ./labels,
 *                 ./interlude.css
 * Used by:        ./MatchScreen, ../host/HostConsole, ../components/Playback (Quick Test)
 * Spec:           docs/spec/01-game-design.md §7 (D14, D20), §13
 */
import type { RoundRecap } from '@sbr/contracts';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import type { PlaybackView } from '../playback.js';
import { useReducedMotion } from '../useReducedMotion.js';
import { useSecondsUntil } from '../useSecondsUntil.js';
import { planInterlude, type InterludePlan, type Pause } from './interludePlan.js';
import { RecapCardBody } from './InterludeCards.js';
import { nextRoundLine, RECAP_TITLE, recapStep } from './labels.js';
import './interlude.css';

// The recap of the round just played while the screen is in the pause after it (D20): a
// live match sends it only then, the Quick Test sends every round's.
export function currentRecap(
  recaps: readonly RoundRecap[] | undefined,
  view: PlaybackView,
): RoundRecap | null {
  if (!view.roundOver || view.finished) return null;
  return recaps?.find((r) => r.roundIndex === view.currentRound) ?? null;
}

interface InterludeProps {
  readonly recap: RoundRecap;
  readonly pause: Pause;
  // When the next round starts (timed pause); null when the host starts it.
  readonly nextRoundAt: number | null;
  readonly me: string | null;
}

// Mount it with `key={recap.roundIndex}`: a new round's recap starts at its first card.
export function Interlude({ recap, pause, nextRoundAt, me }: InterludeProps): ReactElement {
  const reduced = useReducedMotion();
  // The time left counts from when the interlude appeared; the cards follow the recap, which
  // can grow while it is on screen (the cut may come in a later fetch than the round's end).
  const [shownAt] = useState(() => Date.now());
  const sig = JSON.stringify([recap, pause]);
  const plan = useMemo<InterludePlan>(
    () => planInterlude(recap, pause, nextRoundAt === null ? null : nextRoundAt - shownAt),
    // `sig` stands for recap and pause: new objects come with every fetch, the same content not.
    [sig, nextRoundAt, shownAt],
  );
  const [step, move] = useCardSequence(plan);
  const index = Math.min(step, plan.cards.length - 1);
  const card = plan.cards[index] ?? 'facts';
  return (
    <section
      className="sbr-panel interlude"
      data-testid="interlude"
      aria-label="Round recap"
      aria-live="polite"
    >
      <header className="interlude-head">
        <h3>{RECAP_TITLE[card]}</h3>
        <span className="sbr-muted" data-testid="interlude-step">
          {recapStep(index, plan.cards.length)}
        </span>
      </header>
      <div
        key={card}
        className={`interlude-card${reduced ? '' : ' sbr-anim-fade'}`}
        data-testid={`interlude-card-${card}`}
      >
        <RecapCardBody card={card} recap={recap} me={me} />
      </div>
      <nav className="sbr-row interlude-nav" aria-label="Recap cards">
        <StepButton
          label="Previous"
          testId="interlude-prev"
          disabled={!plan.loop && index === 0}
          onStep={() => {
            move(-1);
          }}
        />
        <StepButton
          label="Next"
          testId="interlude-next"
          disabled={!plan.loop && index === plan.cards.length - 1}
          onStep={() => {
            move(1);
          }}
        />
        {pause.kind === 'wait' ? <NextRound at={nextRoundAt} /> : null}
      </nav>
    </section>
  );
}

// The card on screen; it advances by itself after the plan's card time (stopping at the
// last card, or going round when the host starts the next round). A step by hand starts
// the card's time again.
function useCardSequence(plan: InterludePlan): [number, (by: number) => void] {
  const [index, setIndex] = useState(0);
  const count = plan.cards.length;
  const move = (i: number, by: number): number =>
    plan.loop ? (i + by + count) % count : Math.min(count - 1, Math.max(0, i + by));
  useEffect(() => {
    if (!plan.loop && index >= count - 1) return undefined;
    const timer = window.setTimeout(() => {
      setIndex((i) => (plan.loop ? (i + 1) % count : i + 1));
    }, plan.cardMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [index, plan, count]);
  return [
    index,
    (by) => {
      setIndex((i) => move(i, by));
    },
  ];
}

interface StepButtonProps {
  readonly label: string;
  readonly testId: string;
  readonly disabled: boolean;
  readonly onStep: () => void;
}

function StepButton({ label, testId, disabled, onStep }: StepButtonProps): ReactElement {
  return (
    <button
      type="button"
      className="sbr-btn"
      data-testid={testId}
      disabled={disabled}
      onClick={onStep}
    >
      {label}
    </button>
  );
}

// The existing countdown to the next round, at the end of a timed pause.
function NextRound({ at }: { readonly at: number | null }): ReactElement | null {
  const left = useSecondsUntil(at);
  if (left === null || left === 0) return null;
  return (
    <span className="interlude-countdown" data-testid="interlude-countdown">
      {nextRoundLine(left)}
    </span>
  );
}
