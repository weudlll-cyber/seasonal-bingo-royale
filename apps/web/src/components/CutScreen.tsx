/**
 * @file   apps/web/src/components/CutScreen.tsx
 * @module web
 * @brief  The screen after a cut: "You're through" or "You're out in cut N" (01 §7.4, §13).
 *
 * Responsibility: after each cut, show the owner's outcome per owner card until the
 *                 owner closes it or the next cut arrives: a survivor reads "You're
 *                 through — next round in N s" (the countdown when the server announced
 *                 the next round's start), one the shield saved also how far below the
 *                 line they were (from the server), an eliminated owner "You're out in cut N
 *                 — you can keep watching"; the button reads "Keep playing" or "Watch" (D15). A new cut
 *                 scrolls into view. It never pauses playback: an eliminated owner keeps
 *                 watching the spectator view to the end. As a strip (the wide match screens,
 *                 owner decision of 2026-11-28) it is one slim line without a button: it stays
 *                 through the pause and goes when the next round starts.
 * Depends on:     react, ../game/seasonText, ../playback, ../useReducedMotion, ../shell/session
 * Used by:        ./Playback, ../game/ArenaNotice, ../game/WideArena
 * Spec:           docs/spec/01-game-design.md §7.4, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { shieldSavedLine } from '../game/seasonText.js';
import type { CutView } from '../playback.js';
import { useReducedMotion } from '../useReducedMotion.js';
import { useServerCountdown } from '../shell/session.js';

interface CutScreenProps {
  readonly cut: CutView | null;
  // When the next round starts (live matches); null shows no countdown.
  readonly nextRoundAt?: number | null;
  // One line without a button; the caller shows it for as long as it belongs on screen.
  readonly strip?: boolean;
}

export function CutScreen(props: CutScreenProps): ReactElement | null {
  const { cut, nextRoundAt = null, strip = false } = props;
  const reduced = useReducedMotion();
  const [closed, setClosed] = useState(0);
  // The wide screens say the countdown in their head row.
  const left = useServerCountdown(strip ? null : nextRoundAt);
  const box = useRef<HTMLElement>(null);
  const shown = cut?.number ?? 0;
  // A new cut comes into view, also for a player scrolled down to their card.
  useEffect(() => {
    // Test DOMs (jsdom) have no scrollIntoView; every browser has.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    box.current?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [shown, reduced]);
  if (cut === null || cut.owners.length === 0 || closed === cut.number) return null;
  const allOut = cut.owners.every((o) => o.outcome === 'eliminated');
  return (
    <section
      ref={box}
      role="status"
      data-testid="cut-screen"
      className={boxClasses(strip, allOut, reduced)}
    >
      {cut.owners.map((o) => (
        <p key={o.accountId} className="cut-screen-line">
          {cut.owners.length > 1 ? `${o.accountId}: ` : ''}
          <strong>{outcomeText(o, cut.number, left)}</strong>
        </p>
      ))}
      {strip ? null : (
        <CloseButton
          allOut={allOut}
          onClose={() => {
            setClosed(cut.number);
          }}
        />
      )}
    </section>
  );
}

const boxClasses = (strip: boolean, allOut: boolean, reduced: boolean): string =>
  ['cut-screen', strip && 'notice-strip', allOut && 'is-out', !reduced && 'sbr-anim-fade']
    .filter(Boolean)
    .join(' ');

// D15: a survivor plays on, an eliminated player watches.
function CloseButton({
  allOut,
  onClose,
}: {
  readonly allOut: boolean;
  readonly onClose: () => void;
}): ReactElement {
  return (
    <button type="button" className="sk-btn" onClick={onClose}>
      {allOut ? 'Watch' : 'Keep playing'}
    </button>
  );
}

function outcomeText(o: CutView['owners'][number], cutNumber: number, left: number | null): string {
  if (o.outcome === 'eliminated') {
    return `You're out in cut ${String(cutNumber)} — you can keep watching`;
  }
  // The server says how far below the line the shield saved the owner from.
  const saved =
    o.outcome === 'saved' ? ` — ${lowerFirst(shieldSavedLine(cutNumber, o.placesBelow ?? 0))}` : '';
  const next = left === null || left === 0 ? '' : ` — next round in ${String(left)} s`;
  return `You're through${saved}${next}`;
}

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
