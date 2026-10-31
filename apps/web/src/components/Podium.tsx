/**
 * @file   apps/web/src/components/Podium.tsx
 * @module web
 * @brief  Places 1–3 as a podium in season colours.
 *
 * Responsibility: one step per entry with its place, name and a note (points or prizes),
 *                 the viewer's own step highlighted; extracted from the final placement so
 *                 the round recap's top three (D20) uses the same podium.
 * Depends on:     react, ./results.css
 * Used by:        ./FinalPlacement, ../game/Interlude
 * Spec:           docs/spec/01-game-design.md §7 (D20), §7.5, §13
 */
import type { ReactElement } from 'react';

import './results.css';

interface PodiumEntry {
  readonly place: number;
  readonly name: string;
  readonly note: string;
  readonly own: boolean;
  // Test hooks and data the tests read (data-place …).
  readonly attrs: Readonly<Record<string, string | number>>;
}

export function Podium({ entries }: { readonly entries: readonly PodiumEntry[] }): ReactElement {
  return (
    <ol className="podium">
      {entries.map((e) => (
        <li
          key={e.name}
          className={`podium-step podium-step--${String(e.place)}${e.own ? ' is-own' : ''}`}
          {...e.attrs}
        >
          <span className="podium-place">{e.place}</span>
          <span className="podium-name">{e.name}</span>
          <span className="podium-note">{e.note}</span>
        </li>
      ))}
    </ol>
  );
}
