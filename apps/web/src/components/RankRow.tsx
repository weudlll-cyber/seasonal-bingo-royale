/**
 * @file   apps/web/src/components/RankRow.tsx
 * @module web
 * @brief  One ranked row (rank, name, seasons, points, "out") and the divider before the out rows.
 *
 * Responsibility: the row the standings and the final placement share: rank, name, the
 *                 four season icons with the collected ones lit (royale), the points or
 *                 another note, the viewer's own row highlighted, an eliminated row dimmed
 *                 with "out"; and the divider between players still in and those out.
 *                 Season icons have shapes and names, so colour never carries meaning alone.
 * Depends on:     react, ./SeasonIcon, ../types, ./results.css
 * Used by:        ./Standings, ./FinalPlacement
 * Spec:           docs/spec/01-game-design.md §7.5, §8.4, §13
 */
import type { ReactElement } from 'react';

import { SeasonIcon } from './SeasonIcon.js';
import { SEASON_NAMES, type Season } from '../types.js';
import './results.css';

interface RankRowProps {
  readonly rank: number;
  readonly name: string;
  // Points ("120 pts") or, in classic types, the prizes won.
  readonly note: string;
  // The seasons collected (royale), null where seasons do not exist.
  readonly seasons: readonly Season[] | null;
  readonly own: boolean;
  readonly out: boolean;
  // Test hooks and data the acceptance tests read (data-points, data-place …).
  readonly attrs: Readonly<Record<string, string | number>>;
}

export function RankRow(props: RankRowProps): ReactElement {
  const { rank, name, note, seasons, own, out } = props;
  const className = `rank-row${own ? ' is-own' : ''}${out ? ' is-out' : ''}`;
  return (
    <li className={className} {...props.attrs}>
      <span className="rank-num">#{rank}</span>
      <span className="rank-name">
        {name}
        {own ? <span className="sbr-visually-hidden"> (you)</span> : null}
      </span>
      {seasons === null ? null : <SeasonSet seasons={seasons} />}
      <span className="rank-note">{note}</span>
      {out ? <span className="rank-out">out</span> : null}
    </li>
  );
}

function SeasonSet({ seasons }: { readonly seasons: readonly Season[] }): ReactElement {
  return (
    <span className="rank-seasons" aria-label={`${String(seasons.length)} of 4 seasons`}>
      {SEASON_NAMES.map((s) => (
        <SeasonIcon key={s} season={s} size="0.85rem" onColor dimmed={!seasons.includes(s)} />
      ))}
    </span>
  );
}

// Separates the players still in from those out; not a row of its own for screen readers.
export function OutDivider(): ReactElement {
  return (
    <li className="rank-divider" aria-hidden="true">
      Out of the match
    </li>
  );
}
