/**
 * @file   apps/web/src/components/StartForm.tsx
 * @module web
 * @brief  Owner-facing form: game type, prizes, seed, player counts, mode (WP-08).
 *
 * Responsibility: collect the Quick Test inputs the owner picks before each run. The
 *                 prize checklist mirrors the catalogue of 01 §3a.1 and is pre-ticked
 *                 with the default selection from the ruleset defaults. New in this
 *                 pass: owner card count (1..4) and marking mode (manual default).
 * Depends on:     react, ../types, ../api
 * Used by:        ../App
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import { useState, type ReactElement, type SyntheticEvent } from 'react';

import type { StartQuickTestInput } from '../api.js';
import type { GameType, MarkingMode } from '../types.js';

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
  readonly onStart: (input: StartQuickTestInput) => void;
  readonly busy: boolean;
}

interface FormState {
  readonly gameType: GameType;
  readonly seedText: string;
  readonly playerCount: number;
  readonly ownerCards: number;
  readonly markingMode: MarkingMode;
}

const INITIAL: FormState = {
  gameType: 'classicSeasons',
  seedText: 'spring-garden',
  playerCount: 4,
  ownerCards: 1,
  markingMode: 'manual',
};

export function StartForm({ onStart, busy }: StartFormProps): ReactElement {
  const [state, setState] = useState<FormState>(INITIAL);
  const [prizes, setPrizes] = useState<Set<string>>(new Set(DEFAULT_PRIZES));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
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
    const ticked = prizes.size > 0 ? [...prizes] : ['fullCard'];
    onStart({ ...state, tickedPrizes: ticked });
  };
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '0.6rem', maxWidth: '32rem' }}>
      <GameTypeField
        value={state.gameType}
        onChange={(v) => {
          set('gameType', v);
        }}
      />
      <SeedField
        value={state.seedText}
        onChange={(v) => {
          set('seedText', v);
        }}
      />
      <BotCountField
        value={state.playerCount}
        onChange={(v) => {
          set('playerCount', v);
        }}
      />
      <OwnerCardsField
        value={state.ownerCards}
        onChange={(v) => {
          set('ownerCards', v);
        }}
      />
      <MarkingField
        value={state.markingMode}
        onChange={(v) => {
          set('markingMode', v);
        }}
      />
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
      <span>Bot players: {value}</span>
      <input
        type="range"
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
      <span>Your cards: {value}</span>
      <input
        type="range"
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

function MarkingField({
  value,
  onChange,
}: {
  value: MarkingMode;
  onChange: (next: MarkingMode) => void;
}): ReactElement {
  return (
    <label style={{ display: 'grid', gap: '0.25rem' }}>
      <span>Marking mode</span>
      <select
        data-testid="marking-mode"
        value={value}
        onChange={(e) => {
          onChange(e.target.value as MarkingMode);
        }}
      >
        <option value="manual">manual (you tap)</option>
        <option value="auto">auto (bot plays for you)</option>
      </select>
    </label>
  );
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
