/**
 * @file   apps/web/src/shell/ThemeToggle.tsx
 * @module web/shell
 * @brief  The light/dark toggle in the top bar.
 *
 * Responsibility: a round glass button with a stroke icon (a moon in light mode, a sun in
 *                 dark mode, in currentColor) whose accessible name says what a click does
 *                 ("Switch to dark theme"). Icons are aria-hidden; no text glyph or emoji.
 * Depends on:     react, ./theme
 * Used by:        ./AppShell
 * Spec:           docs/spec/01-game-design.md §13; Seasonal Entertainment docs/DESIGN.md "Icons"
 */
import type { ReactElement } from 'react';

import { useTheme } from './theme.js';

export function ThemeToggle(): ReactElement {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      data-testid="theme-toggle"
      data-theme-now={theme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={toggle}
    >
      <svg
        aria-hidden="true"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        )}
      </svg>
    </button>
  );
}
