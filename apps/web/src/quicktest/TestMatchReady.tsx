/**
 * @file   apps/web/src/quicktest/TestMatchReady.tsx
 * @module web/quicktest
 * @brief  The test match's guide: "What happens next", and the match when this tab stays here.
 *
 * Responsibility: the numbered steps from waiting room to result (start, draws, playing along
 *                 and royale rounds as chosen; with the match code once it exists); the panel
 *                 shown only when this tab did not go to the match (the browser blocked the
 *                 console tab, or a step after creating failed): the code, "Open host console"
 *                 in a new tab, "Go to the waiting room" and "New test match"; the message of
 *                 a failed setup step. Nothing of the live match is rendered on the test page.
 * Depends on:     react, ../shell/router, ./testMatchSetup (types)
 * Used by:        ./TestMatch
 * Spec:           docs/spec/01-game-design.md §7.6, §13
 */
import type { ReactElement } from 'react';

import { hrefOf } from '../shell/router.js';
import type { TestMatchValues } from './testMatchSetup.js';

export function SetupError({ error }: { readonly error: string | null }): ReactElement | null {
  if (error === null) return null;
  return (
    <p className="lobby-error" role="alert" data-testid="test-match-error">
      Could not set up the match: {error}
    </p>
  );
}

// The steps the owner will see, in order; with the code once the match exists.
export function NextSteps({
  values,
  code,
}: {
  readonly values: TestMatchValues;
  readonly code: string | null;
}): ReactElement {
  const start = values.start;
  const timed = values.draw.mode === 'auto';
  return (
    <div className="sbr-stack test-steps" data-testid="test-match-steps">
      <h3>What happens next{code === null ? '' : ` — match ${code}`}</h3>
      <ol>
        <li>
          The waiting room opens with the bots already in
          {start.kind === 'now'
            ? '.'
            : ` and starts by itself in ${String(start.minutes)} minute${start.minutes === 1 ? '' : 's'}.`}
        </li>
        <li>A 10-second countdown, then the first round.</li>
        <li>
          {values.playAlong ? 'Your card appears' : 'The bots’ cards play'};{' '}
          {timed
            ? 'numbers are drawn every few seconds.'
            : 'you draw each number with Draw next in the host console.'}
        </li>
        {values.playAlong ? (
          <li>Tap each drawn number on your card; quick taps earn a speed bonus.</li>
        ) : null}
        {values.gameType === 'royale' ? (
          <li>
            After each royale round: the cut, then a pause with the round’s recap (“Start next round
            now” in the host console skips the wait).
          </li>
        ) : null}
        <li>The result: the final placement and the prizes.</li>
      </ol>
    </div>
  );
}

// The match exists but this tab stayed here: the code and the two ways on.
export function OpenedPanel({
  code,
  values,
  error,
  onNew,
}: {
  readonly code: string;
  readonly values: TestMatchValues;
  readonly error: string | null;
  readonly onNew: () => void;
}): ReactElement {
  return (
    <div className="sbr-stack" data-testid="test-match-ready" data-code={code}>
      <p className="open-notice" role="status">
        Test match <strong data-testid="test-match-code">{code}</strong> is open.
        {error === null ? ' Your browser blocked the console’s tab: open it with the link.' : ''}
      </p>
      <div className="sbr-row">
        <a
          className="sbr-btn sbr-btn--primary"
          href={hrefOf({ name: 'host', code })}
          target="_blank"
          rel="noopener"
          data-testid="test-match-console"
        >
          Open host console
        </a>
        <a className="sbr-btn" href={hrefOf({ name: 'match', code })} data-testid="test-match-go">
          Go to the waiting room
        </a>
        <button type="button" className="sbr-btn" data-testid="test-match-new" onClick={onNew}>
          New test match
        </button>
      </div>
      <SetupError error={error} />
      <NextSteps values={values} code={code} />
    </div>
  );
}
