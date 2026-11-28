/**
 * @file   apps/web/src/components/Podium.tsx
 * @module web
 * @brief  Places 1–3 as a podium in season colours.
 *
 * Responsibility: one step per entry with its place, name (a profile link when given), the
 *                 four season marks (royale, ./SeasonSet, a white ring each on the coloured step)
 *                 and a note (points or prizes), the viewer's own step highlighted; on a narrow
 *                 podium (a phone, a large font) the steps are rows, so names stay whole.
 *                 Extracted from the final placement so the round recap's top three (D20)
 *                 uses the same podium.
 * Depends on:     react, ./SeasonSet, ../types, ./podium.css
 * Used by:        ./FinalPlacement, ../game/InterludeCards
 * Spec:           docs/spec/01-game-design.md §7 (D20), §7.5, §13
 */
import type { ReactElement } from 'react';

import { SeasonSet } from './SeasonSet.js';
import type { Season } from '../types.js';
import './podium.css';

interface PodiumEntry {
  readonly place: number;
  readonly name: string;
  readonly href?: string | null | undefined;
  readonly note: string;
  // The player's seasons (royale), shown before the points; null or absent where there are none.
  readonly seasons?: readonly Season[] | null | undefined;
  readonly own: boolean;
  // Test hooks and data the tests read (data-place …).
  readonly attrs: Readonly<Record<string, string | number>>;
}

export function Podium({ entries }: { readonly entries: readonly PodiumEntry[] }): ReactElement {
  // The box measures the podium's width: too narrow for three names side by side, the
  // steps become rows (podium.css).
  return (
    <div className="podium-box">
      <ol className="podium sk-dense-list">
        {entries.map((e) => (
          <li
            key={e.name}
            className={`podium-step podium-step--${String(e.place)}${e.own ? ' is-own' : ''}`}
            {...e.attrs}
          >
            <span className="podium-place">{e.place}</span>
            <span className="podium-name">
              {e.href == null ? e.name : <a href={e.href}>{e.name}</a>}
            </span>
            {e.seasons == null ? null : (
              <SeasonSet seasons={e.seasons} className="podium-seasons" />
            )}
            <span className="podium-note">{e.note}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
