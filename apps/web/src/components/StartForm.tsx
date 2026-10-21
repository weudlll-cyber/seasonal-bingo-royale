/**
 * @file   apps/web/src/components/StartForm.tsx
 * @module web
 * @brief  Owner-facing form: game type, prizes, seed, player counts, mode (WP-08).
 *
 * Responsibility: collect the Quick Test inputs the owner picks before each run. The
 *                 prize checklist mirrors the catalogue of 01 §3a.1 and is pre-ticked
 *                 with the default selection from the ruleset defaults; also owner card
 *                 count (1..4), marking with the missed-number rule (./StartMarkingField,
 *                 D9) and draw control (./StartDrawField, D8). Timed draws send their
 *                 gap so the server measures the missed-number delay in the same draws.
 * Depends on:     react, ../types, ../api, ../drawControl, ./StartDrawField,
 *                 ./StartMarkingField
 * Used by:        ../App
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §5, §6
 */
import { useState, type ReactElement, type SyntheticEvent } from 'react';

import type { StartQuickTestInput } from '../api.js';
import { INITIAL_CONTROL, type DrawControl } from '../drawControl.js';
import { StartDrawField } from './StartDrawField.js';
import {
  INITIAL_MARKING,
  StartMarkingField,
  toMissedNumbers,
  type MarkingChoice,
} from './StartMarkingField.js';
import type { GameType } from '../types.js';

const CATALOGUE = [
  'rows-1',
  'rows-2',
  'rows-3',
  'rows-4',
  'rows-5',
  'columns-1',
  'columns-2',
  'fourCorners',
  'oneDiagonal',
  'bothDiagonals',
  'fullCard',
];
const DEFAULT_PRIZES = new Set(['rows-1', 'rows-2', 'fourCorners', 'oneDiagonal', 'fullCard']);

export interface StartFormProps {
  // The server input, and the draw control the playback starts with (D8).
  readonly onStart: (input: StartQuickTestInput, draw: DrawControl) => void;
  readonly busy: boolean;
}

interface FormState {
  readonly gameType: GameType;
  readonly seedText: string;
  readonly playerCount: number;
  readonly ownerCards: number;
}

const INITIAL: FormState = {
  gameType: 'classicSeasons',
  seedText: 'spring-garden',
  playerCount: 4,
  ownerCards: 1,
};

export function StartForm({ onStart, busy }: StartFormProps): ReactElement {
  const [state, setState] = useState<FormState>(INITIAL);
  const [prizes, setPrizes] = useState<Set<string>>(new Set(DEFAULT_PRIZES));
  const [marking, setMarking] = useState<MarkingChoice>(INITIAL_MARKING);
  const [draw, setDraw] = useState<DrawControl>(INITIAL_CONTROL);
  const bind =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]): void => {
      setState((prev) => ({ ...prev, [key]: value }));
    };
  const toggle = (key: string): void => {
    setPrizes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    onStart(toInput(state, prizes, marking, draw), draw);
  };
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '0.6rem', maxWidth: '32rem' }}>
      <GameTypeField value={state.gameType} onChange={bind('gameType')} />
      <SeedField value={state.seedText} onChange={bind('seedText')} />
      <BotCountField value={state.playerCount} onChange={bind('playerCount')} />
      <OwnerCardsField value={state.ownerCards} onChange={bind('ownerCards')} />
      <StartMarkingField value={marking} onChange={setMarking} />
      <StartDrawField value={draw} onChange={setDraw} />
      <PrizeChecklist checked={prizes} onToggle={toggle} />
      <button type="submit" disabled={busy} style={{ padding: '0.5rem' }} data-testid="start-run">
        {busy ? 'Running…' : 'Run Quick Test'}
      </button>
    </form>
  );
}

function GameTypeField({
  value,
  onChange,
}: {
  value: GameType;
  onChange: (next: GameType) => void;
}): ReactElement {
  return (
    <label style={{ display: 'grid', gap: '0.25rem' }}>
      <span>Game type</span>
      <select
        data-testid="game-type"
        value={value}
        onChange={(e) => {
          onChange(e.target.value as GameType);
        }}
      >
        <option value="royale">royale</option>
        <option value="classicSeasons">classicSeasons</option>
        <option value="classic">classic</option>
      </select>
    </label>
  );
}

function SeedField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}): ReactElement {
  return (
    <label style={{ display: 'grid', gap: '0.25rem' }}>
      <span>Seed</span>
      <input
        data-testid="seed"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

function BotCountField({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}): ReactElement {
  return (
    <label style={{ display: 'grid', gap: '0.25rem' }}>
      <span>Bot players (3–199)</span>
      <input
        type="number"
        data-testid="bot-count"
        min={3}
        max={199}
        value={value}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
      />
    </label>
  );
}

function OwnerCardsField({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}): ReactElement {
  return (
    <label style={{ display: 'grid', gap: '0.25rem' }}>
      <span>Your cards (1–4)</span>
      <input
        type="number"
        data-testid="owner-cards"
        min={1}
        max={4}
        value={value}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
      />
    </label>
  );
}

// The request body: typed numbers brought into the range the server accepts; the
// server keeps the draw gap inside the ruleset range.
function toInput(
  state: FormState,
  prizes: ReadonlySet<string>,
  marking: MarkingChoice,
  draw: DrawControl,
): StartQuickTestInput {
  const timed = draw.mode === 'auto' && draw.intervalSec !== null;
  return {
    ...state,
    playerCount: clamp(state.playerCount, 3, 199),
    ownerCards: clamp(state.ownerCards, 1, 4),
    tickedPrizes: prizes.size > 0 ? [...prizes] : ['fullCard'],
    markingMode: marking.mode,
    missedNumbers: toMissedNumbers(marking),
    ...(timed ? { drawIntervalMs: Math.round(draw.intervalSec * 1000) } : {}),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}

function PrizeChecklist({
  checked,
  onToggle,
}: {
  checked: ReadonlySet<string>;
  onToggle: (key: string) => void;
}): ReactElement {
  return (
    <fieldset style={{ border: '1px solid #223', padding: '0.5rem' }}>
      <legend>Prizes ticked (classic only; royale ignores the list)</legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '0.25rem' }}>
        {CATALOGUE.map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={checked.has(key)}
              onChange={() => {
                onToggle(key);
              }}
            />{' '}
            {key}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
