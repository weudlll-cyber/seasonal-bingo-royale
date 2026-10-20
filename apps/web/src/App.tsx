/**
 * @file   apps/web/src/App.tsx
 * @module web
 * @brief  Quick Test page: start form, playback, owner-plays-with-bots (WP-08).
 *
 * Responsibility: wire the start form, play the match back one draw per tick at the
 *                 owner's chosen pace (./useDrawTicker), dispatch to Playback.
 *                 All strings in English (01 §13); animations respect
 *                 prefers-reduced-motion (handled per component).
 * Depends on:     react, ./api, ./types, ./playback, ./drawPace, ./useDrawTicker,
 *                 ./components/*
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §3, §13
 */
import { useMemo, useState, type ReactElement } from 'react';

import { startQuickTest, type StartQuickTestInput } from './api.js';
import { DevBadge } from './components/DevBadge.js';
import { StartForm } from './components/StartForm.js';
import { Playback } from './components/Playback.js';
import type { PaceLabel } from './drawPace.js';
import { playbackAt } from './playback.js';
import type { QuickTestResult } from './types.js';
import { useDrawTicker } from './useDrawTicker.js';

export function App(): ReactElement {
  const [result, setResult] = useState<QuickTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pace, setPace] = useState<PaceLabel>('realtime');
  const run = (input: StartQuickTestInput): void => {
    setBusy(true);
    setError(null);
    startQuickTest(input)
      .then((r) => {
        setResult(r);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Unknown error');
      })
      .finally(() => {
        setBusy(false);
      });
  };
  // One draw per tick at the ruleset draw interval (./drawPace).
  const step = useDrawTicker(result, pace);
  const view = useMemo(() => (result === null ? null : playbackAt(result, step)), [result, step]);
  return (
    <main style={layoutStyle}>
      <section>
        <h1 style={{ margin: 0, fontSize: '1.1rem' }}>Seasonal Bingo Royale — Quick Test</h1>
        <p style={{ color: '#9aa5b2' }}>
          Pick a seed, who you play with and against, and press run.
        </p>
        <StartForm onStart={run} busy={busy} />
        {error !== null && <p style={{ color: '#ff7a7a' }}>Error: {error}</p>}
        <PaceControl value={pace} onChange={setPace} />
      </section>
      <section>
        {result === null || view === null ? (
          <p style={{ color: '#9aa5b2' }}>Nothing yet. Fill in the form and press run.</p>
        ) : (
          <Playback result={result} view={view} />
        )}
      </section>
      <DevBadge />
    </main>
  );
}

// Form beside the match on wide screens; stacked on a phone.
const layoutStyle: React.CSSProperties = {
  padding: '1rem',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(22rem, 100%), 1fr))',
  gap: '1.5rem',
};

function PaceControl({
  value,
  onChange,
}: {
  value: PaceLabel;
  onChange: (p: PaceLabel) => void;
}): ReactElement {
  return (
    <div role="group" aria-label="Draw pace" style={{ marginTop: '0.75rem' }}>
      {(['slower', 'realtime', 'faster', 'skip'] as const).map((label) => (
        <button
          key={label}
          type="button"
          onClick={() => {
            onChange(label);
          }}
          aria-pressed={value === label}
          style={paceButtonStyle(value === label)}
        >
          {label === 'skip' ? 'skip to end' : label}
        </button>
      ))}
    </div>
  );
}

function paceButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '0.35rem 0.65rem',
    marginRight: '0.3rem',
    background: active ? '#2a3a56' : '#1a2130',
    color: '#e6edf7',
    border: active ? '1px solid #3b73c8' : '1px solid #223',
    borderRadius: '0.3rem',
    cursor: 'pointer',
  };
}
