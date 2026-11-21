/**
 * @file   apps/web/src/host/StartMatch.tsx
 * @module web/host
 * @brief  "Start a match": the Organizer's three steps on one page, then Open the lobby.
 *
 * Responsibility: above the steps, the Organizer's open and running matches (./YourMatches);
 *                 then the published presets (GET /presets): 1 game type, 2 preset (the first
 *                 preselected), 3 this match (./ThisMatchFields, reset to the preset's values
 *                 when the preset changes); the summary line and "Open the lobby", which posts
 *                 the match (./startForm) and opens its console. The server decides the rules
 *                 and refuses what the preset does not allow; the page shows its refusal.
 *                 Everything else of the preset (points, seasons, cuts, jackpot) is not shown
 *                 (admin-area §3). In place of the host form with seconds and prizes.
 * Depends on:     react, ../game/labels, ../shell/http, ../shell/router, ./StartSteps,
 *                 ./ThisMatchFields, ./startForm, ./TimingFields, ./YourMatches, ../game/game.css,
 *                 ./host.css
 * Used by:        ../shell/AppShell
 * Spec:           docs/concepts/admin-area.md §3, §8 (g), (h), §9 piece 4; 05 §2.3
 */
import { useEffect, useState, type ReactElement, type SyntheticEvent } from 'react';

import { problemText } from '../game/labels.js';
import '../game/game.css';
import './host.css';
import { api, ApiError } from '../shell/http.js';
import { navigate } from '../shell/router.js';
import type { GameType } from '../types.js';
import {
  initialValues,
  startBody,
  summaryLine,
  type StartPreset,
  type StartValues,
} from './startForm.js';
import { GameTypeStep, PresetStep } from './StartSteps.js';
import { ThisMatchFields } from './ThisMatchFields.js';
import { startTimeProblem } from './TimingFields.js';
import { YourMatches } from './YourMatches.js';

interface Chosen {
  readonly preset: StartPreset;
  readonly values: StartValues;
}

const choose = (p: StartPreset): Chosen => ({ preset: p, values: initialValues(p, new Date()) });

// The published presets, the chosen one with this match's values, and a refusal as a sentence.
function useStart() {
  const [presets, setPresets] = useState<readonly StartPreset[] | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ presets: StartPreset[] }>('/presets')
      .then((r) => {
        setPresets(r.presets);
        const first = r.presets.find((p) => p.gameType === 'royale') ?? r.presets[0];
        // A second answer (strict mode runs the effect twice) keeps the Organizer's choices.
        if (first !== undefined) setChosen((now) => now ?? choose(first));
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? problemText(e.code) : problemText(''));
      });
  }, []);
  const pickType = (g: GameType): void => {
    const first = presets?.find((p) => p.gameType === g);
    if (first !== undefined) setChosen(choose(first));
  };
  const pickPreset = (id: string): void => {
    const p = presets?.find((x) => x.id === id);
    if (p !== undefined) setChosen(choose(p));
  };
  const set = <K extends keyof StartValues>(key: K, value: StartValues[K]): void => {
    setChosen((c) => (c === null ? c : { ...c, values: { ...c.values, [key]: value } }));
  };
  return { presets, chosen, error, setError, pickType, pickPreset, set };
}

export function StartMatch(): ReactElement {
  const { presets, chosen, error, setError, pickType, pickPreset, set } = useStart();
  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    if (chosen === null) return;
    const now = Date.now();
    const startProblem = startTimeProblem(chosen.values.start, now);
    setError(startProblem);
    if (startProblem !== null) return;
    api<{ code: string }>('/matches', {
      method: 'POST',
      body: startBody(chosen.values, chosen.preset, now),
    })
      .then((r) => {
        navigate({ name: 'host', code: r.code });
      })
      .catch((e: unknown) => {
        setError(
          e instanceof ApiError
            ? `Could not open the lobby: ${problemText(e.code)}`
            : 'Could not open the lobby.',
        );
      });
  };
  const type = chosen?.preset.gameType ?? 'royale';
  return (
    <div className="create-page">
      <YourMatches />
      <form className="create-form" onSubmit={submit} data-testid="create-match">
        <h1>Start a match</h1>
        <p className="sbr-muted">
          Three choices, then open the lobby. Everything else comes from the preset.
        </p>
        {presets === null || chosen === null ? null : (
          <>
            <GameTypeStep value={type} presets={presets} onChange={pickType} />
            <PresetStep
              presets={presets.filter((p) => p.gameType === type)}
              value={chosen.preset.id}
              onChange={pickPreset}
            />
            <ThisMatchFields preset={chosen.preset} values={chosen.values} set={set} />
          </>
        )}
        <SubmitBar chosen={chosen} error={error} />
      </form>
    </div>
  );
}

// Under the steps: the summary, a refusal, Open the lobby.
function SubmitBar(props: {
  readonly chosen: Chosen | null;
  readonly error: string | null;
}): ReactElement {
  const { chosen, error } = props;
  return (
    <div className="start-submit">
      {chosen === null ? null : (
        <p className="start-summary" data-testid="start-summary">
          {summaryLine(chosen.values, chosen.preset)}
        </p>
      )}
      {error !== null ? <p className="lobby-error">{error}</p> : null}
      <button
        type="submit"
        className="sbr-btn sbr-btn--primary sbr-btn--big"
        disabled={chosen === null}
        data-testid="create-submit"
      >
        Open the lobby
      </button>
    </div>
  );
}
