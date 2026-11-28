/**
 * @file   apps/web/src/useWideScreen.ts
 * @module web
 * @brief  React hook: is there room for the match screens' columns at the reader's font?
 *
 * Responsibility: true on a desktop window (from 960 px) at least 52 root-font steps wide (the
 *                 page's 48 of ./shell/shell.css and its gutters): 832 px at a 16 px root font,
 *                 1664 px at 32 px. Narrower, on a phone or at a large font, the match screens
 *                 stack. Follows the window and the root font. Where matchMedia is missing (a
 *                 non-browser test environment) it answers false: the stacked screens.
 * Depends on:     react
 * Used by:        ./game/MatchScreen, ./game/Lobby, ./host/HostConsole
 * Spec:           docs/spec/01-game-design.md §13; docs/concepts/fit-audit.md §12
 */
import { useSyncExternalStore } from 'react';

const DESKTOP = '(min-width: 960px)';
const STEPS = 52;

function wide(): boolean {
  if (typeof window.matchMedia !== 'function' || !window.matchMedia(DESKTOP).matches) return false;
  const font = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return window.innerWidth >= STEPS * font;
}

function follow(changed: () => void): () => void {
  window.addEventListener('resize', changed);
  // A new root font changes the page's height, not the window's size.
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(changed) : null;
  observer?.observe(document.documentElement);
  observer?.observe(document.body);
  return () => {
    window.removeEventListener('resize', changed);
    observer?.disconnect();
  };
}

export function useWideScreen(): boolean {
  return useSyncExternalStore(follow, wide, () => false);
}
