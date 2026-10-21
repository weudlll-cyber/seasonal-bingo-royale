/**
 * @file   apps/web/src/components/CutScreen.tsx
 * @module web
 * @brief  The screen after a cut: "You're through" or "You're out in cut N" (01 §7.4, §13).
 *
 * Responsibility: after each cut, show the owner's outcome per owner card until the
 *                 owner closes it or the next cut arrives: a survivor reads "You're
 *                 through — next round in N s" (the countdown when the server announced
 *                 the next round's start), an eliminated owner "You're out in cut N — you
 *                 can keep watching". It never pauses playback: an eliminated owner keeps
 *                 watching the spectator view to the end.
 * Depends on:     react, ../playback, ../useReducedMotion, ../useSecondsUntil
 * Used by:        ./Playback, ../game/MatchScreen
 * Spec:           docs/spec/01-game-design.md §7.4, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { useState, type ReactElement } from 'react';

import type { CutOutcome, CutView } from '../playback.js';
import { useReducedMotion } from '../useReducedMotion.js';
import { useSecondsUntil } from '../useSecondsUntil.js';

export interface CutScreenProps {
  readonly cut: CutView | null;
  // When the next round starts (live matches); null shows no countdown.
  readonly nextRoundAt?: number | null;
}

export function CutScreen({ cut, nextRoundAt = null }: CutScreenProps): ReactElement | null {
  const reduced = useReducedMotion();
  const [closed, setClosed] = useState(0);
  const left = useSecondsUntil(nextRoundAt);
  if (cut === null || cut.owners.length === 0 || closed === cut.number) return null;
  const allOut = cut.owners.every((o) => o.outcome === 'eliminated');
  return (
    <section
      role="status"
      data-testid="cut-screen"
      className={`cut-screen${allOut ? ' is-out' : ''}${reduced ? '' : ' sbr-anim-fade'}`}
    >
      {cut.owners.map((o) => (
        <p key={o.accountId} className="cut-screen-line">
          {cut.owners.length > 1 ? `${o.accountId}: ` : ''}
          <strong>{outcomeText(o.outcome, cut.number, left)}</strong>
        </p>
      ))}
      <button
        type="button"
        className="sbr-btn"
        onClick={() => {
          setClosed(cut.number);
        }}
      >
        {allOut ? 'Keep watching' : 'Back to the game'}
      </button>
    </section>
  );
}

function outcomeText(outcome: CutOutcome, cutNumber: number, left: number | null): string {
  if (outcome === 'eliminated') {
    return `You're out in cut ${String(cutNumber)} — you can keep watching`;
  }
  const saved = outcome === 'saved' ? ', saved by your Winter shield' : '';
  const next = left === null || left === 0 ? '' : ` — next round in ${String(left)} s`;
  return `You're through${saved}${next}`;
}
