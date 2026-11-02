/**
 * @file   apps/web/src/App.tsx
 * @module web
 * @brief  The development test page "Test a match" (nav entry "Quick Test", WP-08): a chooser.
 *
 * Responsibility: on #/quicktest the heading, one sentence and two large choices; each opens
 *                 its own sub-route (browser Back returns here) and shows only that way: "Play
 *                 a test match" (./quicktest/TestMatch, a real match on this server) or "Check
 *                 a game by seed" (./quicktest/Simulation, a computed replay). The build badge.
 *                 All strings in English (01 §13).
 * Depends on:     react, ./components/DevBadge, ./quicktest/TestMatch, ./quicktest/Simulation,
 *                 ./shell/router, ./quicktest/quicktest.css
 * Used by:        ./shell/AppShell (lazy, development only)
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §7.6, §13
 */
import type { ReactElement } from 'react';

import { DevBadge } from './components/DevBadge.js';
import { Simulation } from './quicktest/Simulation.js';
import { TestMatchSection } from './quicktest/TestMatch.js';
import { hrefOf, type QuickTestView } from './shell/router.js';
import './quicktest/quicktest.css';

export function App({ view }: { readonly view?: QuickTestView | undefined }): ReactElement {
  return (
    <div className="sbr-stack test-page" data-testid="test-page">
      {view === 'play' ? <TestMatchSection /> : null}
      {view === 'seed' ? <Simulation /> : null}
      {view === undefined ? <Chooser /> : null}
      <DevBadge />
    </div>
  );
}

function Chooser(): ReactElement {
  return (
    <>
      <header className="sbr-stack test-intro">
        <h1>Test a match</h1>
        <p>Try the game alone: play a real match against bots, or replay a game from its seed.</p>
      </header>
      <nav className="test-choices" aria-label="Ways to test">
        <a
          className="sbr-panel test-choice"
          href={hrefOf({ name: 'quicktest', view: 'play' })}
          data-testid="choose-play"
        >
          <strong>Play a test match</strong>
          <span>
            A live match on this server with bots: waiting room, countdown, your card, cuts and the
            result, exactly as players see them. The host console opens in a second tab.
          </span>
        </a>
        <a
          className="sbr-panel test-choice"
          href={hrefOf({ name: 'quicktest', view: 'seed' })}
          data-testid="choose-seed"
        >
          <strong>Check a game by seed</strong>
          <span>
            A computed replay of one seed in this browser, in seconds: reproduce a game or check its
            scoring. Not a live game.
          </span>
        </a>
      </nav>
    </>
  );
}
