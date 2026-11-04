/**
 * @file   apps/web/src/components/PatternsPanel.tsx
 * @module web
 * @brief  "Patterns this round" (royale): what can still be scored and who was first (01 §8.1).
 *
 * Responsibility: every pattern active in the round's stage with its points (from the
 *                 server's view of the ruleset); a tick when the viewer's card has it this
 *                 round; "first: <name> (+50 %)" once someone completed it first (every name
 *                 the server gave the bonus on that draw, D45), "still open"
 *                 before. Who completed what comes from the server's patternScored events
 *                 (the fold, ../playbackScoring); nothing is evaluated here.
 * Depends on:     react, ../game/labels, ../playback, ../types, ./matchSide.css
 * Used by:        ../game/MatchScreen
 * Spec:           docs/spec/01-game-design.md §8.1, §13
 */
import type { ReactElement } from 'react';

import { prizeName } from '../game/labels.js';
import type { PlaybackView } from '../playback.js';
import type { QuickTestResult } from '../types.js';
import './matchSide.css';

export function PatternsPanel({
  result,
  view,
}: {
  readonly result: QuickTestResult;
  readonly view: PlaybackView;
}): ReactElement | null {
  const keys = result.stagePlan[view.roundStage]?.activePatterns ?? [];
  if (keys.length === 0) return null;
  return (
    <section className="sbr-panel side-panel" data-testid="patterns-panel">
      <h3>Patterns this round</h3>
      <ul className="pattern-rows">
        {keys.map((key) => {
          const p = view.roundPatterns[key];
          return (
            <li
              key={key}
              data-testid={`pattern-${key}`}
              className={p?.mine ? 'is-mine' : undefined}
            >
              <span className="pattern-tick" aria-label={p?.mine ? 'you have it' : undefined}>
                {p?.mine ? '✓' : ''}
              </span>
              <span className="pattern-name">{prizeName(key)}</span>
              <span className="pattern-points">{String(result.patternPoints[key] ?? 0)} pts</span>
              <span className="pattern-first sbr-muted">
                {p === undefined || p.firsts.length === 0
                  ? 'still open'
                  : `first: ${p.firsts.join(', ')} (+${String(result.firstBonusPercent)} %)`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
