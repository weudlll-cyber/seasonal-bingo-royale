/**
 * @file   apps/web/src/components/RankRow.tsx
 * @module web
 * @brief  One ranked row (rank, name, seasons, points, "out") and the group labels between rows.
 *
 * Responsibility: the row the standings and the final placement share: rank, name, the
 *                 four season icons with the collected ones lit (royale), the points or
 *                 another note, the viewer's own row highlighted, an eliminated row dimmed
 *                 with "out"; the name as a profile link where the screen gives one, or a
 *                 name that can be selected (a watcher follows that player, D24); and the
 *                 group labels ("Still in", "Out of the match" after a divider).
 *                 Season icons have shapes and names, so colour never carries meaning alone.
 * Depends on:     react, ./SeasonIcon, ../types, ./results.css
 * Used by:        ./Standings, ./FinalPlacement, ../game/InterludeCards
 * Spec:           docs/spec/01-game-design.md §7.5, §8.4, §13
 */
import type { ReactElement } from 'react';

import { SeasonIcon } from './SeasonIcon.js';
import { SEASON_NAMES, type Season } from '../types.js';
import './results.css';

// The profile link of a shown name, or null for a name without a profile (bots).
export type ProfileHref = (name: string) => string | null;

interface RankRowProps {
  readonly rank: number;
  readonly name: string;
  // The player's profile (live match screen only); plain text without it.
  readonly href?: string | null | undefined;
  // Points ("120 pts") or, in classic types, the prizes won.
  readonly note: string;
  // The seasons collected (royale), null where seasons do not exist.
  readonly seasons: readonly Season[] | null;
  readonly own: boolean;
  readonly out: boolean;
  // Test hooks and data the acceptance tests read (data-points, data-place …).
  readonly attrs: Readonly<Record<string, string | number>>;
  // Makes the name a button (a watcher follows this player, D24).
  readonly onSelect?: (() => void) | undefined;
  // The note already says the player is out ("out in cut 2 · 515 pts"): no "out" badge.
  readonly outNoted?: boolean;
}

export function RankRow(props: RankRowProps): ReactElement {
  const { rank, note, seasons, own, out } = props;
  const className = `rank-row${own ? ' is-own' : ''}${out ? ' is-out' : ''}`;
  return (
    <li className={className} {...props.attrs}>
      <span className="rank-num">#{rank}</span>
      <RankName {...props} />
      {seasons === null ? null : <SeasonSet seasons={seasons} />}
      <span className="rank-note">{note}</span>
      {out && props.outNoted !== true ? <span className="rank-out">out</span> : null}
    </li>
  );
}

// A watcher's button to follow the player (D24), else the name, linked to the profile
// where the screen gives one.
function RankName({ name, href, own, onSelect }: RankRowProps): ReactElement {
  if (onSelect !== undefined)
    return (
      <button type="button" className="rank-name rank-name-btn" onClick={onSelect}>
        {name}
        <span className="sbr-visually-hidden"> — show this card</span>
      </button>
    );
  return (
    <span className="rank-name">
      {href == null ? name : <a href={href}>{name}</a>}
      {own ? <span className="sbr-visually-hidden"> (you)</span> : null}
    </span>
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

// Names a group of rows ("Still in", "Out of the match" after a divider); not a row of
// its own for screen readers.
export function GroupLabel({
  text,
  divider = false,
}: {
  readonly text: string;
  readonly divider?: boolean;
}): ReactElement {
  return (
    <li className={divider ? 'rank-divider' : 'rank-group'} aria-hidden="true">
      {text}
    </li>
  );
}
