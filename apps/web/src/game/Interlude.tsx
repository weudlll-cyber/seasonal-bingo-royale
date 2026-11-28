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
 *                 (D15) stays above it. In the wide form (owner decision of 2026-11-28) a
 *                 card's head line reads "Title · lead" with Previous and Next at its right, the
 *                 step shows as dots under the card, every card of the pause takes the height of
 *                 the tallest, and the countdown is the screen's head row's. Motion is a fade
 *                 that switches off under
 *                 prefers-reduced-motion. Fun only: it shows what the server sent and changes
 *                 nothing.
 * Depends on:     react, @sbr/contracts (types), ../playback (types), ../shell/session
 *                 (useScreens, the card time), ../useReducedMotion,
 *                 ../shell/session, ./interludePlan, ./InterludeCards, ./labels,
 *                 ./interlude.css
 * Used by:        ./ArenaNotice, ./WideArena, ../host/HostConsole, ../host/WideConsole, ../components/Playback (Quick Test)
 * Spec:           docs/spec/01-game-design.md §7 (D14, D20), §13
 */
import type { RoundRecap } from '@sbr/contracts';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import type { PlaybackView } from '../playback.js';
import { useReducedMotion } from '../useReducedMotion.js';
import { planInterlude, type InterludePlan, type Pause } from './interludePlan.js';
import { RecapCardBody } from './InterludeCards.js';
import {
  climberLine,
  cutOutLine,
  nextRoundLine,
  RECAP_TITLE,
  recapStep,
  type RecapCard,
} from './labels.js';
import './interlude.css';
import { useScreens, useServerCountdown } from '../shell/session.js';

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
  // The wide screens' form (./WideArena, ../host/WideConsole).
  readonly compact?: boolean;
}

// Mount it with `key={recap.roundIndex}`: a new round's recap starts at its first card.
export function Interlude(props: InterludeProps): ReactElement {
  const { recap, pause, nextRoundAt, me, compact = false } = props;
  const reduced = useReducedMotion();
  // The time left counts from when the interlude appeared; the cards follow the recap, which
  // can grow while it is on screen (the cut may come in a later fetch than the round's end).
  const [shownAt] = useState(() => Date.now());
  const sig = JSON.stringify([recap, pause]);
  const cardMs = useScreens().recapCardMs;
  const plan = useMemo<InterludePlan>(
    () => planInterlude(recap, pause, nextRoundAt === null ? null : nextRoundAt - shownAt, cardMs),
    // `sig` stands for recap and pause: new objects come with every fetch, the same content not.
    [sig, nextRoundAt, shownAt, cardMs],
  );
  const [step, move] = useCardSequence(plan);
  const index = Math.min(step, plan.cards.length - 1);
  const card = plan.cards[index] ?? 'facts';
  const steps = <StepButtons plan={plan} index={index} move={move} />;
  if (compact) {
    return <CompactRecap recap={recap} me={me} plan={plan} index={index} steps={steps} />;
  }
  return (
    <section
      className="sk-panel interlude"
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
        {steps}
        {pause.kind === 'wait' ? <NextRound at={nextRoundAt} /> : null}
      </nav>
    </section>
  );
}

interface CompactProps {
  readonly recap: RoundRecap;
  readonly me: string | null;
  readonly plan: InterludePlan;
  readonly index: number;
  readonly steps: ReactElement;
}

// Every card lies in the same place, only the current one shown, so the box keeps the height
// of the tallest card of this pause.
function CompactRecap({ recap, me, plan, index, steps }: CompactProps): ReactElement {
  const reduced = useReducedMotion();
  const card = plan.cards[index] ?? 'facts';
  const lead = recapLead(card, recap);
  return (
    <section
      className="sk-panel interlude interlude--compact"
      data-testid="interlude"
      aria-label="Round recap"
    >
      <header className="interlude-head">
        <h3>
          {RECAP_TITLE[card]}
          {lead === null ? null : <span className="interlude-lead"> · {lead}</span>}
        </h3>
        <nav className="interlude-nav" aria-label="Recap cards">
          {steps}
        </nav>
      </header>
      <div className="interlude-cards" aria-live="polite">
        {plan.cards.map((each, i) => (
          <div
            key={each}
            className={`interlude-card${i === index && !reduced ? ' sbr-anim-fade' : ''}`}
            data-testid={i === index ? `interlude-card-${each}` : undefined}
            data-current={i === index}
            aria-hidden={i === index ? undefined : true}
          >
            <RecapCardBody card={each} recap={recap} me={me} compact />
          </div>
        ))}
      </div>
      <p className="interlude-dots" data-testid="interlude-step">
        <span className="sk-visually-hidden">{recapStep(index, plan.cards.length)}</span>
        {plan.cards.map((each, i) => (
          <span key={each} aria-hidden="true" className={i === index ? 'is-current' : undefined} />
        ))}
      </p>
    </section>
  );
}

// What a card's head line says after its title: the cut's count, the climber's way up.
function recapLead(card: RecapCard, recap: RoundRecap): string | null {
  if (card === 'cut' && recap.cut !== undefined && recap.cut.outCount > 0) {
    return cutOutLine(recap.cut.outCount);
  }
  const climber = card === 'climber' ? recap.climber : undefined;
  return climber === undefined ? null : `${climber.name}, ${climberLine(climber.from, climber.to)}`;
}

// Previous and Next; a pause the host ends goes round.
function StepButtons({
  plan,
  index,
  move,
}: {
  readonly plan: InterludePlan;
  readonly index: number;
  readonly move: (by: number) => void;
}): ReactElement {
  return (
    <>
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
    </>
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
      className="sk-btn"
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
  const left = useServerCountdown(at);
  if (left === null || left === 0) return null;
  return (
    <span className="interlude-countdown" data-testid="interlude-countdown">
      {nextRoundLine(left)}
    </span>
  );
}
