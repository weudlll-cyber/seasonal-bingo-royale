/**
 * @file   apps/web/src/App.tsx
 * @module web
 * @brief  Quick Test page: start form, playback, owner-plays-with-bots (WP-08).
 *
 * Responsibility: wire the start form, drive the lifecycle playback through a timer at
 *                 the owner's chosen pace, dispatch to Playback for the match-wide view.
 *                 All strings in English (01 §13); animations respect
 *                 prefers-reduced-motion (handled per component).
 * Depends on:     react, ./api, ./types, ./playback, ./components/*
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §3, §13
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { startQuickTest, type StartQuickTestInput } from './api.js';
import { DevBadge } from './components/DevBadge.js';
import { StartForm } from './components/StartForm.js';
import { Playback } from './components/Playback.js';
import { playbackAt } from './playback.js';
import type { QuickTestResult } from './types.js';

type PaceLabel = 'slower' | 'realtime' | 'faster' | 'skip';

export function App(): ReactElement {
  const [result, setResult] = useState<QuickTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [pace, setPace] = useState<PaceLabel>('realtime');
  const run = (input: StartQuickTestInput): void => {
    setBusy(true);
    setError(null);
    setStep(0);
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
  const view = useMemo(() => (result === null ? null : playbackAt(result, step)), [result, step]);
  useEventTicker({ result, step, setStep, pace });
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

const layoutStyle: React.CSSProperties = {
  padding: '1.5rem',
  display: 'grid',
  gridTemplateColumns: '22rem 1fr',
  gap: '1.5rem',
};

interface TickerArgs {
  readonly result: QuickTestResult | null;
  readonly step: number;
  readonly setStep: (next: number | ((prev: number) => number)) => void;
  readonly pace: PaceLabel;
}

function useEventTicker(args: TickerArgs): void {
  const { result, step, setStep, pace } = args;
  const paused = pace === 'skip';
  const intervalMs = paceInterval(pace, result?.drawIntervalMs ?? 1_000);
  useEffect(() => {
    if (result === null) return undefined;
    if (step >= result.events.length) return undefined;
    const budget = paused ? 50 : perTickBudget(pace);
    const ms = paused ? 10 : intervalMs;
    const id = window.setInterval(() => {
      setStep((n) => Math.min(n + budget, result.events.length));
    }, ms);
    return () => {
      window.clearInterval(id);
    };
  }, [result, step, pace, intervalMs, paused, setStep]);
}

function paceInterval(pace: PaceLabel, baseMs: number): number {
  if (pace === 'slower') return Math.max(50, baseMs);
  if (pace === 'faster') return Math.max(10, Math.round(baseMs / 4));
  if (pace === 'skip') return 1;
  return Math.max(20, Math.round(baseMs / 2));
}

function perTickBudget(pace: PaceLabel): number {
  if (pace === 'faster') return 8;
  if (pace === 'slower') return 1;
  return 4;
}

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
