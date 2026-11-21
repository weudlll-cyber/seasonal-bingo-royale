/**
 * @file   apps/web/src/host/BasicsFields.tsx
 * @module web/host
 * @brief  The host form's first fields: title, game type, max players.
 *
 * Responsibility: the title (its length) and the player range come from the server's limits
 *                 (../shell/session useLimits, admin-area §8 (m)); the form keeps no copy and
 *                 shows nothing until the session has answered. The browser refuses a value
 *                 out of range before the form is sent; the server checks it again.
 * Depends on:     react, ../game/labels, ../shell/session, ./CreateMatch (types), ../types
 * Used by:        ./CreateMatch
 * Spec:           docs/spec/05-api-design.md §2.3; docs/concepts/admin-area.md §9 piece 0
 */
import type { ReactElement } from 'react';

import { GAME_TYPES, gameTypeName } from '../game/labels.js';
import { useLimits } from '../shell/session.js';
import type { GameType } from '../types.js';
import type { FieldsProps } from './CreateMatch.js';

export function BasicsFields({ values, set }: FieldsProps): ReactElement | null {
  // The server's limits (admin-area §8 (m)); the form keeps no copy of them.
  const limits = useLimits();
  if (limits === null) return null;
  const { min, max } = limits.players;
  return (
    <>
      <label className="sbr-field">
        <span>Title</span>
        <input
          className="sbr-input"
          data-testid="create-title"
          value={values.title}
          maxLength={limits.titleMaxLength}
          onChange={(e) => {
            set('title', e.target.value);
          }}
        />
      </label>
      <label className="sbr-field">
        <span>Game type</span>
        <select
          className="sbr-select"
          data-testid="create-game-type"
          value={values.gameType}
          onChange={(e) => {
            set('gameType', e.target.value as GameType);
          }}
        >
          {GAME_TYPES.map((g) => (
            <option key={g} value={g}>
              {gameTypeName(g)}
            </option>
          ))}
        </select>
      </label>
      <label className="sbr-field">
        <span>
          Max players ({String(min)}–{String(max)})
        </span>
        <input
          className="sbr-input"
          type="number"
          min={min}
          max={max}
          data-testid="create-max"
          value={values.maxPlayers}
          onChange={(e) => {
            set('maxPlayers', Number(e.target.value));
          }}
        />
      </label>
    </>
  );
}
