/**
 * @file   apps/web/src/components/RecentEvents.tsx
 * @module web
 * @brief  The newest 3 event lines below the drawn numbers, the whole match log one click away.
 *
 * Responsibility: the 3 newest lines of the match (patterns, seasons, Season Complete, shield
 *                 saves, cuts …), newest first, always in view, the newest fading in; when the
 *                 newest line belongs to a newer round than lines below it, a thin separator
 *                 naming that round ("Round 2") sits above its lines and the earlier round's
 *                 lines are dimmed. Below them the whole match log (newest first, each round's
 *                 lines under a separator naming it once there is more than one round) in a
 *                 closed disclosure that scrolls inside itself when opened, so it never pushes
 *                 the page. Hidden while there is no line yet (01 §13).
 * Depends on:     react, ../playback, ../useReducedMotion, ./matchSide.css
 * Used by:        ../game/MatchScreen, ./Playback
 * Spec:           docs/spec/01-game-design.md §13
 */
import type { ReactElement } from 'react';

import type { Banner } from '../playback.js';
import { useReducedMotion } from '../useReducedMotion.js';
import './matchSide.css';

const SHOWN = 3;

export function RecentEvents({
  banners,
}: {
  readonly banners: readonly Banner[];
}): ReactElement | null {
  const reduced = useReducedMotion();
  const newest = [...banners].reverse();
  const top = newest.slice(0, SHOWN);
  const latest = top[0]?.round;
  if (latest === undefined) return null;
  const mixed = top.some((b) => b.round !== latest);
  const rounds = byRound(newest);
  return (
    <section className="recent-events" aria-label="Latest in the match">
      <div className="recent-lines" data-testid="recent-events" aria-live="polite">
        {mixed ? <RoundSeparator round={latest} /> : null}
        <ol>
          {top.map((b, i) => {
            // The newest line fades in, unless the viewer prefers reduced motion (01 §13).
            const fade = i === 0 && !reduced ? 'sbr-anim-fade' : '';
            const earlier = b.round === latest ? '' : 'is-earlier';
            return (
              <li key={b.key} className={`${fade} ${earlier}`.trim() || undefined}>
                {b.text}
              </li>
            );
          })}
        </ol>
      </div>
      <details className="match-log">
        <summary>Whole match log ({String(banners.length)})</summary>
        <div data-testid="match-log">
          {rounds.map((group) => (
            <section key={group.round}>
              {rounds.length > 1 ? <RoundSeparator round={group.round} /> : null}
              <ol>
                {group.lines.map((b) => (
                  <li key={b.key}>{b.text}</li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </details>
    </section>
  );
}

// "Round 2" over a thin line: the round the lines below it belong to.
function RoundSeparator({ round }: { readonly round: number }): ReactElement {
  return (
    <p className="round-separator" data-testid="round-separator">
      Round {String(round + 1)}
    </p>
  );
}

// Lines (newest first) in runs of the same round, in the same order.
function byRound(lines: readonly Banner[]): { round: number; lines: Banner[] }[] {
  const groups: { round: number; lines: Banner[] }[] = [];
  for (const line of lines) {
    const last = groups.at(-1);
    if (last?.round === line.round) last.lines.push(line);
    else groups.push({ round: line.round, lines: [line] });
  }
  return groups;
}
