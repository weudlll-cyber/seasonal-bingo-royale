/**
 * @file   apps/web/src/App.tsx
 * @module web
 * @brief  Quick Test page: start form, playback, owner-plays-with-bots (WP-08).
 *
 * Responsibility: wire the start form, play the match back one draw at a time under
 *                 the owner's draw control — `auto` interval or `host` "Draw next",
 *                 switchable during play (./useDrawTicker, D8) — and dispatch to
 *                 Playback, remounted for every new run so no per-run state carries
 *                 over. All strings in English (01 §13); animations respect
 *                 prefers-reduced-motion (handled per component).
 * Depends on:     react, ./api, ./types, ./playback, ./drawControl, ./useDrawTicker,
 *                 ./components/*
 * Used by:        ./shell/AppShell
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §3, §5, §13
 */
import { useMemo, useState, type ReactElement } from 'react';

import { startQuickTest, type StartQuickTestInput } from './api.js';
import { DevBadge } from './components/DevBadge.js';
import { DrawControls } from './components/DrawControls.js';
import { StartForm } from './components/StartForm.js';
import { Playback } from './components/Playback.js';
import { autoIntervalMs, INITIAL_CONTROL, type DrawControl } from './drawControl.js';
import { playbackAt } from './playback.js';
import type { QuickTestResult } from './types.js';
import { useDrawTicker } from './useDrawTicker.js';

export function App(): ReactElement {
  const [result, setResult] = useState<QuickTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [control, setControl] = useState<DrawControl>(INITIAL_CONTROL);
  // Identity of the run on screen. It keys the whole match view, so every component
  // with per-run state (owner cards, cut screen, …) mounts fresh for each new run,
  // even with the same seed and settings.
  const [runId, setRunId] = useState(0);
  const run = (input: StartQuickTestInput, draw: DrawControl): void => {
    setBusy(true);
    setError(null);
    // A new run starts with the form's draw control and is not skipped.
    setControl({ ...draw, skipped: false });
    startQuickTest(input)
      .then((r) => {
        setResult(r);
        setRunId((n) => n + 1);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Unknown error');
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const { step, drawNext } = useDrawTicker(result, control);
  const view = useMemo(() => (result === null ? null : playbackAt(result, step)), [result, step]);
  const effectiveSec =
    result === null ? (control.intervalSec ?? 5) : autoIntervalMs(control, result) / 1000;
  return (
    <main style={layoutStyle}>
      <section>
        <h1 style={{ margin: 0, fontSize: '1.1rem' }}>Seasonal Bingo Royale — Quick Test</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Pick a seed, who you play with and against, and press run.
        </p>
        <StartForm onStart={run} busy={busy} />
        {error !== null && <p style={{ color: 'var(--color-danger)' }}>Error: {error}</p>}
        <DrawControls
          control={control}
          effectiveSec={effectiveSec}
          canDraw={view !== null && !view.finished}
          onChange={setControl}
          onDrawNext={drawNext}
        />
      </section>
      <section>
        {result === null || view === null ? (
          <p style={{ color: 'var(--color-text-muted)' }}>
            Nothing yet. Fill in the form and press run.
          </p>
        ) : (
          <Playback key={runId} result={result} view={view} />
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
