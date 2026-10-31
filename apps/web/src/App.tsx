/**
 * @file   apps/web/src/App.tsx
 * @module web
 * @brief  The development test page "Test a match" (nav entry "Quick Test", WP-08).
 *
 * Responsibility: the heading and a few plain sentences on the two ways to test, then
 *                 section A, a real test match with bots on this server (./quicktest/TestMatch),
 *                 and section B, the seed simulation played back in the browser
 *                 (./quicktest/Simulation); the build badge. All strings in English (01 §13).
 * Depends on:     react, ./components/DevBadge, ./quicktest/TestMatch, ./quicktest/Simulation,
 *                 ./quicktest/quicktest.css
 * Used by:        ./shell/AppShell (lazy, development only)
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §7.6, §13
 */
import type { ReactElement } from 'react';

import { DevBadge } from './components/DevBadge.js';
import { Simulation } from './quicktest/Simulation.js';
import { TestMatchSection } from './quicktest/TestMatch.js';
import './quicktest/quicktest.css';

export function App(): ReactElement {
  return (
    <div className="sbr-stack test-page" data-testid="test-page">
      <header className="sbr-stack">
        <h1>Test a match</h1>
        <p>
          Two ways to try the game alone. <strong>A — Real test match</strong> opens a live match on
          this server with bots, so the waiting room, countdown, cards, cuts and recap run exactly
          as for real players: use it to see the game as players will.
        </p>
        <p className="sbr-muted">
          <strong>B — Seed simulation</strong> replays one seed in this browser in seconds, with no
          waiting room: use it to reproduce a game by its seed or check scoring quickly.
        </p>
      </header>
      <TestMatchSection />
      <Simulation />
      <DevBadge />
    </div>
  );
}
