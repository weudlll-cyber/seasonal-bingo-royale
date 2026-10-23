/**
 * @file   apps/web/src/shell/theme.ts
 * @module web/shell
 * @brief  Light and dark theme: the website's logic, kept in step with <html data-theme>.
 *
 * Responsibility: resolve the theme as ../../public/theme-init.js does before the first
 *                 paint — a stored choice (localStorage `se.theme`) wins, otherwise the
 *                 system setting — follow the system setting live while nothing is stored,
 *                 and flip and store the choice on the toggle. Every storage access is in
 *                 try/catch: with storage blocked the system setting applies and the toggle
 *                 still works for the visit.
 * Depends on:     react
 * Used by:        ./ThemeToggle
 * Spec:           docs/spec/01-game-design.md §13; Seasonal Entertainment docs/DESIGN.md "Theme logic"
 */
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const KEY = 'se.theme';
const QUERY = '(prefers-color-scheme: dark)';

function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // Blocked storage: the choice holds for this visit only.
  }
}

const systemTheme = (): Theme => (window.matchMedia(QUERY).matches ? 'dark' : 'light');

// The same resolution as the early script.
export function resolveTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

function apply(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function useTheme(): { readonly theme: Theme; readonly toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(resolveTheme);
  useEffect(() => {
    apply(theme);
  }, [theme]);
  // The system setting is followed live while no choice is stored.
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = (): void => {
      if (storedTheme() === null) setTheme(systemTheme());
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);
  const toggle = (): void => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    storeTheme(next);
    setTheme(next);
  };
  return { theme, toggle };
}
