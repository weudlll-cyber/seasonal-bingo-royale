/**
 * @file   apps/web/src/App.tsx
 * @module web
 * @brief  Quick Test page: start form on the left, playback on the right (WP-08).
 *
 * Responsibility: wire the form to the dev server, step through the returned draws at
 *                 a human-visible cadence, show cards, draws, awards and the final
 *                 placement. All of it respects the dev-only context: the dev badge
 *                 renders in the corner (08 §1.1).
 * Depends on:     react, ./api, ./types, ./components/*
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { startQuickTest, type StartQuickTestInput } from './api.js';
import { CardGrid } from './components/CardGrid.js';
import { DevBadge } from './components/DevBadge.js';
import { DrawTicker } from './components/DrawTicker.js';
import { StartForm } from './components/StartForm.js';
import type { QuickTestResult } from './types.js';

interface AppState {
  readonly result: QuickTestResult | null;
  readonly error: string | null;
  readonly busy: boolean;
  readonly step: number;
}

function useQuickTest(): {
  readonly state: AppState;
  readonly run: (input: StartQuickTestInput) => void;
} {
  const [result, setResult] = useState<QuickTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const totalDraws = result?.draws.length ?? 0;

  useEffect(() => {
    if (result === null) return undefined;
    if (step >= totalDraws - 1) return undefined;
    const timer = setTimeout(() => {
      setStep((n) => n + 1);
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [result, step, totalDraws]);

  const run = (input: StartQuickTestInput): void => {
    setBusy(true);
    setError(null);
    setStep(0);
    startQuickTest(input)
      .then((response) => {
        setResult(response);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return { state: { result, error, busy, step }, run };
}

export function App(): ReactElement {
  const { state, run } = useQuickTest();
  const marksAt = useMemo(
    () => progressiveMarks(state.result, state.step),
    [state.result, state.step],
  );
  const awardsSoFar = useMemo(
    () => (state.result?.awards ?? []).filter((a) => a.drawIndex <= state.step),
    [state.result, state.step],
  );
  return (
    <main
      style={{
        padding: '1.5rem',
        display: 'grid',
        gridTemplateColumns: '20rem 1fr',
        gap: '1.5rem',
      }}
    >
      <section>
        <h1 style={{ margin: 0, fontSize: '1.1rem' }}>Seasonal Bingo Royale — Quick Test</h1>
        <p style={{ color: '#9aa5b2' }}>Pick a seed and press run.</p>
        <StartForm onStart={run} busy={state.busy} />
        {state.error !== null && <p style={{ color: '#ff7a7a' }}>Error: {state.error}</p>}
      </section>
      <section>
        {state.result === null ? (
          <p style={{ color: '#9aa5b2' }}>Nothing yet. Fill in the form and press run.</p>
        ) : (
          <Playback
            result={state.result}
            step={state.step}
            marksAt={marksAt}
            awardsSoFar={awardsSoFar}
          />
        )}
      </section>
      <DevBadge />
    </main>
  );
}

interface PlaybackProps {
  readonly result: QuickTestResult;
  readonly step: number;
  readonly marksAt: ReadonlyMap<string, readonly boolean[]>;
  readonly awardsSoFar: readonly QuickTestResult['awards'][number][];
}

function Playback({ result, step, marksAt, awardsSoFar }: PlaybackProps): ReactElement {
  const finished = step >= result.draws.length - 1;
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: '0 0 .5rem' }}>
          {result.gameType} — draw {step + 1} / {result.draws.length}
        </h2>
        <DrawTicker draws={result.draws} stepIndex={step} />
      </div>
      <div>
        <h3 style={{ margin: '0 0 .25rem' }}>Awards so far</h3>
        {awardsSoFar.length === 0 ? (
          <p style={{ color: '#9aa5b2', margin: 0 }}>No prizes awarded yet.</p>
        ) : (
          <ul style={{ margin: 0 }}>
            {awardsSoFar.map((award, i) => (
              <li key={`${award.prizeKey}-${award.accountId}-${String(i)}`}>
                draw #{award.drawIndex + 1}: <strong>{award.accountId}</strong> wins{' '}
                <em>{award.prizeKey}</em>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
          gap: '1rem',
        }}
      >
        {result.players.map((player) => (
          <div
            key={player.accountId}
            style={{ background: '#1a2130', padding: '0.5rem', borderRadius: '0.5rem' }}
          >
            <CardGrid
              accountId={player.accountId}
              cells={player.card.cells}
              marks={marksAt.get(player.accountId) ?? []}
            />
            {finished && (
              <p style={{ margin: '0.5rem 0 0', color: '#9aa5b2' }}>
                place #{player.place} · prizes: {player.prizesWon.join(', ') || 'none'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function progressiveMarks(
  result: QuickTestResult | null,
  step: number,
): ReadonlyMap<string, readonly boolean[]> {
  const map = new Map<string, readonly boolean[]>();
  if (result === null) return map;
  const drawnSet = new Set(result.draws.slice(0, step + 1));
  for (const player of result.players) {
    const marks = player.card.cells.map((cell) => {
      if (cell.kind === 'free') return true;
      if (cell.kind === 'number') return drawnSet.has(cell.value);
      return drawnSet.has(cell.value);
    });
    map.set(player.accountId, marks);
  }
  return map;
}
