/**
 * @file   apps/web/src/components/StartForm.tsx
 * @module web
 * @brief  Owner-facing form: game type, prizes, seed, player count (WP-08).
 *
 * Responsibility: collect the Quick Test inputs the owner picks before each run. The
 *                 prize checklist mirrors the catalogue of 01 §3a.1 and is pre-ticked
 *                 with the default selection from the ruleset defaults.
 * Depends on:     react, ../types
 * Used by:        ../App
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import { useState, type ReactElement, type SyntheticEvent } from 'react';

import type { StartQuickTestInput } from '../api.js';
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
  readonly onStart: (input: StartQuickTestInput) => void;
  readonly busy: boolean;
}

export function StartForm({ onStart, busy }: StartFormProps): ReactElement {
  const [gameType, setGameType] = useState<GameType>('classicSeasons');
  const [seedText, setSeedText] = useState('spring-garden');
  const [playerCount, setPlayerCount] = useState(4);
  const [prizes, setPrizes] = useState<Set<string>>(new Set(DEFAULT_PRIZES));

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
    onStart({ gameType, seedText, playerCount, tickedPrizes: ticked });
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem', maxWidth: '32rem' }}>
      <GameTypeField value={gameType} onChange={setGameType} />
      <SeedField value={seedText} onChange={setSeedText} />
      <PlayerCountField value={playerCount} onChange={setPlayerCount} />
      <PrizeChecklist checked={prizes} onToggle={toggle} />
      <button type="submit" disabled={busy} style={{ padding: '0.5rem' }}>
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
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

function PlayerCountField({
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
        min={2}
        max={20}
        value={value}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
      />
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
      <legend>Prizes ticked</legend>
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
