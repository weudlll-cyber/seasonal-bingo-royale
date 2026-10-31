/**
 * @file   apps/web/src/quicktest/Simulation.tsx
 * @module web/quicktest
 * @brief  Section B of the test page: the seed simulation, played back in this browser (WP-08).
 *
 * Responsibility: the start form until the first run; after a run it folds to one line (game
 *                 type, seed) with "Change settings", and only the live draw control remains
 *                 (`auto` interval or `host` "Draw next", switchable during play, D8) — never
 *                 two draw controls at once. Plays the match back one draw at a time
 *                 (../useDrawTicker) through ../components/Playback, remounted for every run so
 *                 no per-run state carries over (fresh-state rule).
 * Depends on:     react, ../api, ../components/*, ../drawControl, ../game/interludePlan (types),
 *                 ../game/labels, ../playback, ../types, ../useDrawTicker, ./quicktest.css
 * Used by:        ../App
 * Spec:           docs/spec/15-implementation-plan.md WP-08; docs/spec/01-game-design.md §3, §5, §13
 */
import { useMemo, useState, type ReactElement } from 'react';

import { startQuickTest, type StartQuickTestInput } from '../api.js';
import { DrawControls } from '../components/DrawControls.js';
import { Playback } from '../components/Playback.js';
import { StartForm } from '../components/StartForm.js';
import { autoIntervalMs, INITIAL_CONTROL, type DrawControl } from '../drawControl.js';
import type { Pause } from '../game/interludePlan.js';
import { gameTypeName } from '../game/labels.js';
import { playbackAt } from '../playback.js';
import type { QuickTestResult } from '../types.js';
import { useDrawTicker } from '../useDrawTicker.js';
import './quicktest.css';

export function Simulation(): ReactElement {
  const { result, error, busy, control, setControl, ran, formOpen, setFormOpen, runId, run } =
    useSimulationRun();
  const { step, drawNext } = useDrawTicker(result, control);
  const view = useMemo(() => (result === null ? null : playbackAt(result, step)), [result, step]);
  const effectiveSec =
    result === null ? (control.intervalSec ?? 5) : autoIntervalMs(control, result) / 1000;
  return (
    <section className="sbr-panel sbr-stack test-section" data-testid="simulation">
      <h2>B — Seed simulation</h2>
      <p className="sbr-muted">
        A fast simulated replay of one seed in this browser, with no waiting room: for reproducing a
        game by its seed.
      </p>
      <div hidden={!formOpen}>
        <StartForm onStart={run} busy={busy} />
      </div>
      {error !== null ? <p className="lobby-error">Error: {error}</p> : null}
      {ran !== null ? <RunLine ran={ran} formOpen={formOpen} onToggle={setFormOpen} /> : null}
      {result === null || view === null ? (
        <p className="sbr-muted">Nothing yet. Fill in the form and press Run simulation.</p>
      ) : (
        <div className="sim-grid">
          {/* One draw control at a time: the form's while it is open, else the live one. */}
          {formOpen ? null : (
            <DrawControls
              control={control}
              effectiveSec={effectiveSec}
              canDraw={!view.finished}
              onChange={setControl}
              onDrawNext={drawNext}
            />
          )}
          <Playback key={runId} result={result} view={view} pause={pauseOf(control, result)} />
        </div>
      )}
    </section>
  );
}

// The run on screen and its settings: a new run starts with the form's draw control, not
// skipped, and folds the form.
function useSimulationRun() {
  const [result, setResult] = useState<QuickTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [control, setControl] = useState<DrawControl>(INITIAL_CONTROL);
  // The settings of the run on screen, for the folded line; the form stays mounted (hidden)
  // so "Change settings" reopens it with the same values.
  const [ran, setRan] = useState<StartQuickTestInput | null>(null);
  const [formOpen, setFormOpen] = useState(true);
  // Identity of the run on screen. It keys the whole match view, so every component
  // with per-run state (owner cards, cut screen, …) mounts fresh for each new run,
  // even with the same seed and settings.
  const [runId, setRunId] = useState(0);
  const run = (input: StartQuickTestInput, draw: DrawControl): void => {
    setBusy(true);
    setError(null);
    setControl({ ...draw, skipped: false });
    startQuickTest(input)
      .then((r) => {
        setResult(r);
        setRan(input);
        setFormOpen(false);
        setRunId((n) => n + 1);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Unknown error');
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return { result, error, busy, control, setControl, ran, formOpen, setFormOpen, runId, run };
}

// The run on screen in one line, and the switch between its settings and the live control.
function RunLine({
  ran,
  formOpen,
  onToggle,
}: {
  readonly ran: StartQuickTestInput;
  readonly formOpen: boolean;
  readonly onToggle: (open: boolean) => void;
}): ReactElement {
  return (
    <p className="sbr-row sim-run-line" data-testid="simulation-summary">
      <span>
        Running: <strong>{gameTypeName(ran.gameType)}</strong> · seed{' '}
        <strong>{ran.seedText}</strong>
      </span>
      <button
        type="button"
        className="sbr-btn"
        data-testid="simulation-change"
        onClick={() => {
          onToggle(!formOpen);
        }}
      >
        {formOpen ? 'Back to the run' : 'Change settings'}
      </button>
    </p>
  );
}

// The pause after a royale round, for the round recap (D20): one draw interval with timed
// draws, until Draw next with host draws.
function pauseOf(control: DrawControl, result: QuickTestResult): Pause {
  return control.mode === 'host'
    ? { kind: 'host' }
    : { kind: 'wait', ms: autoIntervalMs(control, result) };
}
