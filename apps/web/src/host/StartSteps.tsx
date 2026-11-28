/**
 * @file   apps/web/src/host/StartSteps.tsx
 * @module web/host
 * @brief  Steps 1 and 2 of "Start a match": the game type, then a preset of that type.
 *
 * Responsibility: step 1, three large tiles (Battle royale, Classic with seasons, Classic) with
 *                 one line each on what it is; a type without a published preset cannot be
 *                 picked. Step 2, the published presets of the chosen type as tiles: name, the
 *                 players range, an asynchronous preset says so, the Admin's line of what is
 *                 special, "Counts for the league"; with one preset the step is one line
 *                 (admin-area §3). Both are radio groups.
 * Depends on:     react, ../game/labels, ./startForm (types)
 * Used by:        ./StartMatch
 * Spec:           docs/concepts/admin-area.md §3, §9 piece 4
 */
import type { ReactElement } from 'react';

import { GAME_TYPES, gameTypeName } from '../game/labels.js';
import type { GameType } from '../types.js';
import type { StartPreset } from './startForm.js';

const WHAT_IT_IS: Readonly<Record<GameType, string>> = {
  royale: 'Stages and cuts down to a final.',
  classicSeasons: 'One round with prizes, season effects on.',
  classic: 'Plain bingo: one round with prizes.',
};

export function GameTypeStep(props: {
  readonly value: GameType;
  readonly presets: readonly StartPreset[];
  readonly onChange: (g: GameType) => void;
}): ReactElement {
  return (
    <section className="start-step" aria-labelledby="start-step-1">
      <h2 id="start-step-1">
        <span className="start-step-num">1</span>Game type
      </h2>
      <div className="start-tiles" role="radiogroup" aria-labelledby="start-step-1">
        {GAME_TYPES.map((g) => {
          const none = !props.presets.some((p) => p.gameType === g);
          return (
            <label key={g} className="start-tile" data-testid={`start-type-${g}`}>
              <input
                type="radio"
                name="start-type"
                checked={props.value === g}
                disabled={none}
                onChange={() => {
                  props.onChange(g);
                }}
              />
              <strong>{gameTypeName(g)}</strong>
              <span className="sbr-muted">{none ? 'No preset published yet.' : WHAT_IT_IS[g]}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

const rangeText = (p: StartPreset): string =>
  `${String(p.players.min)} to ${String(p.players.max)} players${p.mode === 'async' ? ' · asynchronous, over days' : ''}`;

export function PresetStep(props: {
  readonly presets: readonly StartPreset[];
  readonly value: string;
  readonly onChange: (id: string) => void;
}): ReactElement {
  const only = props.presets.length === 1 ? props.presets[0] : undefined;
  return (
    <section className="start-step" aria-labelledby="start-step-2">
      <h2 id="start-step-2">
        <span className="start-step-num">2</span>Preset
      </h2>
      {only === undefined ? (
        <div className="start-tiles" role="radiogroup" aria-labelledby="start-step-2">
          {props.presets.map((p) => (
            <label key={p.id} className="start-tile" data-testid={`start-preset-${p.id}`}>
              <input
                type="radio"
                name="start-preset"
                checked={props.value === p.id}
                onChange={() => {
                  props.onChange(p.id);
                }}
              />
              <PresetFacts preset={p} />
            </label>
          ))}
        </div>
      ) : (
        <p className="start-one" data-testid={`start-preset-${only.id}`}>
          <PresetFacts preset={only} />
        </p>
      )}
    </section>
  );
}

function PresetFacts({ preset: p }: { readonly preset: StartPreset }): ReactElement {
  return (
    <>
      <strong>{p.name}</strong>
      <span>{rangeText(p)}</span>
      {p.description === '' ? null : <span className="sbr-muted">{p.description}</span>}
      {p.countsForLeaderboard ? <span className="sk-chip">Counts for the league</span> : null}
    </>
  );
}
