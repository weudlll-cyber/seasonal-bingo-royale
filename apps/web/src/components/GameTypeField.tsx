/**
 * @file   apps/web/src/components/GameTypeField.tsx
 * @module web
 * @brief  The game type select of the Quick Test form and the test-match form.
 *
 * Responsibility: one labelled select over the game types with their names; the form gives
 *                 the value, the change handler and its test id.
 * Depends on:     react, ../game/labels, ../types
 * Used by:        ./StartForm, ../quicktest/TestMatch
 * Spec:           docs/spec/01-game-design.md §2
 */
import type { ReactElement } from 'react';

import { GAME_TYPES, gameTypeName } from '../game/labels.js';
import type { GameType } from '../types.js';

export function GameTypeField({
  value,
  onChange,
  testId,
}: {
  readonly value: GameType;
  readonly onChange: (next: GameType) => void;
  readonly testId: string;
}): ReactElement {
  return (
    <label className="sbr-field">
      <span>Game type</span>
      <select
        className="sbr-select"
        data-testid={testId}
        value={value}
        onChange={(e) => {
          onChange(e.target.value as GameType);
        }}
      >
        {GAME_TYPES.map((g) => (
          <option key={g} value={g}>
            {gameTypeName(g)}
          </option>
        ))}
      </select>
    </label>
  );
}
