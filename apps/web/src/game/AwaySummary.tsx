/**
 * @file   apps/web/src/game/AwaySummary.tsx
 * @module web/game
 * @brief  "While you were away" on top of an asynchronous match, with Dismiss (01 §11).
 *
 * Responsibility: fetch GET /matches/:code/away-summary when the screen opens and whenever
 *                 the page becomes visible again; when the page is hidden, fetch it once more
 *                 without showing it, which tells the server what the player has seen (the
 *                 fetch acknowledges, 05 §2.3). Show the server's summary in plain words —
 *                 numbers drawn, own marks, patterns, seasons, Season Complete, points, rank,
 *                 cuts survived or out, the end — until the player dismisses it. The server
 *                 computes every number; this file only words them.
 * Depends on:     react, @sbr/contracts (types), ../shell/http
 * Used by:        ./MatchScreen
 * Spec:           docs/spec/01-game-design.md §11; docs/spec/06-realtime-architecture.md §6
 */
import type { AwaySummary as Summary } from '@sbr/contracts';
import { useEffect, useState, type ReactElement } from 'react';

import { api } from '../shell/http.js';

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// The rank line: "Rank 5 → 2 (4 still in)", or the rank now when there was none before.
function rankLine(s: Summary): string | null {
  if (s.rankNow === null) return null;
  const still = `(${String(s.playersIn)} still in)`;
  if (s.rankBefore === null) return `Rank ${String(s.rankNow)} ${still}`;
  return `Rank ${String(s.rankBefore)} → ${String(s.rankNow)} ${still}`;
}

function endLine(s: Summary): string | null {
  if (!s.finished) return null;
  return s.finalPlace === null
    ? 'The match has ended.'
    : `The match is over — you finished in place ${String(s.finalPlace)}.`;
}

function cutLine(s: Summary): string | null {
  const survived =
    s.cutsSurvived > 0 ? `You survived ${plural(s.cutsSurvived, 'cut', 'cuts')}` : null;
  if (!s.eliminated) return survived === null ? null : `${survived}.`;
  const out = 'went out in a cut — you can still watch.';
  return survived === null ? `You ${out}` : `${survived}, then ${out}`;
}

// The summary in plain lines, items without content left out.
export function awayLines(s: Summary): readonly string[] {
  const lines = [
    `${plural(s.draws, 'number', 'numbers')} drawn, ${String(s.marks)} marked on your card`,
    s.patterns > 0 ? `${plural(s.patterns, 'pattern', 'patterns')} completed` : null,
    s.seasons.length > 0 ? `Seasons activated: ${s.seasons.map(capital).join(', ')}` : null,
    s.seasonComplete ? 'Season Complete — all four seasons!' : null,
    `Points ${String(s.pointsBefore)} → ${String(s.pointsNow)}`,
    rankLine(s),
    cutLine(s),
    endLine(s),
  ];
  return lines.filter((l): l is string => l !== null);
}

// The summary to show (null: nothing new), and Dismiss.
function useAwaySummary(code: string): readonly [Summary | null, () => void] {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    // Every answer that has a summary is shown, also one that arrives after a re-run of
    // this effect (React's strict mode runs it twice): the fetch has acknowledged it, so
    // the next fetch would have nothing.
    const look = (show: boolean): void => {
      api<{ summary: Summary | null }>(`/matches/${code}/away-summary`)
        .then((r) => {
          if (show && r.summary !== null) setSummary(r.summary);
        })
        .catch(() => undefined);
    };
    look(true);
    // Hidden: what was on screen counts as seen; visible again: what happened meanwhile.
    const onVisibility = (): void => {
      look(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [code]);
  return [
    summary,
    () => {
      setSummary(null);
    },
  ];
}

export function AwaySummary({ code }: { readonly code: string }): ReactElement | null {
  const [summary, dismiss] = useAwaySummary(code);
  if (summary === null) return null;
  return (
    <section
      className="sbr-panel away-summary"
      data-testid="away-summary"
      data-draws={summary.draws}
      aria-label="While you were away"
    >
      <div className="away-summary__head">
        <h2>While you were away</h2>
        <button type="button" className="sbr-btn" data-testid="away-dismiss" onClick={dismiss}>
          Dismiss
        </button>
      </div>
      <ul>
        {awayLines(summary).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
