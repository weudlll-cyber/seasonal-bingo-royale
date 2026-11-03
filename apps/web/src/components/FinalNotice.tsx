/**
 * @file   apps/web/src/components/FinalNotice.tsx
 * @module web
 * @brief  The final's fresh start made clear (D23): "Final: all N finalists start at 0 points".
 *
 * Responsibility: when the royale's final stage has begun — in the pause before its round and
 *                 during its first draws — every viewer (players, players out, spectators, the
 *                 host) sees one notice in the cut screen's style above the play area: all N
 *                 finalists start at 0 points (the final's score reset, 01 §7.2), and how the
 *                 final is won, worded from the ruleset's win condition (01 §7.5). It closes with
 *                 "Got it" and goes by itself after the final's first few draws.
 * Depends on:     react, ../playback, ../types, ./results.css
 * Used by:        ../game/ArenaNotice, ../host/HostConsole
 * Spec:           docs/spec/01-game-design.md §7.2, §7.5, §13 (D23)
 */
import { useState, type ReactElement } from 'react';

import type { PlaybackView } from '../playback.js';
import type { QuickTestResult, RoundEndRule } from '../types.js';
import './results.css';

// The notice goes once the final has drawn this many numbers.
const SHOWN_DRAWS = 3;

export function FinalNotice({
  result,
  view,
}: {
  readonly result: QuickTestResult;
  readonly view: PlaybackView;
}): ReactElement | null {
  const [closed, setClosed] = useState(false);
  const stage = result.stagePlan[view.currentStage];
  const inFinal = result.gameType === 'royale' && stage?.kind === 'final';
  // Before the final's round (the pause) or during its first draws.
  const early = view.roundStage !== view.currentStage || view.drawsSoFar.length < SHOWN_DRAWS;
  if (!inFinal || !early || view.finished || closed) return null;
  const finalists = view.standings.filter((p) => !p.eliminated).length;
  return (
    <section className="cut-screen final-notice" role="status" data-testid="final-notice">
      <p className="cut-screen-line">
        <strong>
          Final: all {String(finalists)} finalists start at 0 points — {winLine(stage.roundEnd)}
        </strong>
      </p>
      <button
        type="button"
        className="sbr-btn"
        onClick={() => {
          setClosed(true);
        }}
      >
        Got it
      </button>
    </section>
  );
}

// How the final is won, from its win condition: the winner is 1st (01 §7.5), the others
// follow by points (§8.4).
function winLine(rule: RoundEndRule): string {
  switch (rule.kind) {
    case 'firstFullHouse':
      return 'the first full card wins.';
    case 'drawCount':
      return `the most points after ${String(rule.draws)} numbers win.`;
    case 'firstBingo':
      return 'the first completed pattern wins.';
    case 'bingoQuota':
      return `the final ends when ${String(rule.quotaPercent)} % of the finalists have completed a pattern, and the most points win.`;
  }
}
