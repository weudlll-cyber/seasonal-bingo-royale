/**
 * @file   apps/web/src/components/CutScreen.tsx
 * @module web
 * @brief  The screen after a cut: "You survived" or "Eliminated – keep watching" (01 §13).
 *
 * Responsibility: after each cut, show the owner's outcome per owner card until the
 *                 owner closes it or the next cut arrives. It never pauses playback:
 *                 an eliminated owner keeps watching the spectator view to the end.
 * Depends on:     react, ../playback, ../useReducedMotion
 * Used by:        ./Playback
 * Spec:           docs/spec/01-game-design.md §7, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { useState, type ReactElement } from 'react';

import type { CutOutcome, CutView } from '../playback.js';
import { useReducedMotion } from '../useReducedMotion.js';

export function CutScreen({ cut }: { cut: CutView | null }): ReactElement | null {
  const reduced = useReducedMotion();
  const [closed, setClosed] = useState(0);
  if (cut === null || cut.owners.length === 0 || closed === cut.number) return null;
  return (
    <section
      role="status"
      data-testid="cut-screen"
      className={reduced ? undefined : 'sbr-anim-fade'}
      style={{
        padding: '0.75rem 1rem',
        borderRadius: '0.5rem',
        background: '#22304a',
        border: '1px solid #3b73c8',
      }}
    >
      {cut.owners.map((o) => (
        <p key={o.accountId} style={{ margin: '0 0 0.25rem', fontSize: '1.2rem' }}>
          {cut.owners.length > 1 ? `${o.accountId}: ` : ''}
          <strong>{OUTCOME_TEXT[o.outcome]}</strong>
        </p>
      ))}
      <button
        type="button"
        onClick={() => {
          setClosed(cut.number);
        }}
      >
        Keep watching
      </button>
    </section>
  );
}

const OUTCOME_TEXT: Readonly<Record<CutOutcome, string>> = {
  survived: 'You survived',
  saved: 'You survived – saved by your Winter shield',
  eliminated: 'Eliminated – keep watching',
};
