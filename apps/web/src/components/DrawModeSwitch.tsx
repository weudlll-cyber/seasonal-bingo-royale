/**
 * @file   apps/web/src/components/DrawModeSwitch.tsx
 * @module web/components
 * @brief  The segmented "Host draws" / "Timed draws" switch (D8), one for every screen.
 *
 * Responsibility: two buttons in a segmented frame; the active mode is filled and marked
 *                 with a check. The caller owns the mode and what a change does (the Quick
 *                 Test's playback control, the host's draw.setMode intent); `testIdPrefix`
 *                 keeps each screen's test ids (`<prefix>-host`, `<prefix>-timed`).
 * Depends on:     react, ../drawControl (DrawMode), ./segmented.css
 * Used by:        ./DrawControls, ../host/HostDrawControls
 * Spec:           docs/spec/01-game-design.md §5, §13
 */
import type { ReactElement } from 'react';

import type { DrawMode } from '../drawControl.js';
import './segmented.css';

const OPTIONS: readonly { readonly mode: DrawMode; readonly id: string; readonly label: string }[] =
  [
    { mode: 'host', id: 'host', label: 'Host draws' },
    { mode: 'auto', id: 'timed', label: 'Timed draws' },
  ];

export function DrawModeSwitch({
  mode,
  onMode,
  testIdPrefix,
}: {
  readonly mode: DrawMode;
  readonly onMode: (next: DrawMode) => void;
  readonly testIdPrefix: string;
}): ReactElement {
  return (
    <div className="segmented" role="group" aria-label="Draw mode">
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          className="segmented-option"
          aria-pressed={mode === o.mode}
          data-testid={`${testIdPrefix}-${o.id}`}
          onClick={() => {
            onMode(o.mode);
          }}
        >
          {mode === o.mode ? '✓ ' : ''}
          {o.label}
        </button>
      ))}
    </div>
  );
}
