/**
 * @file   apps/web/src/game/labels.ts
 * @module web/game
 * @brief  Plain-English names of game types and of a match's rules, shared by all screens.
 *
 * Responsibility: "Battle royale" / "Classic with seasons" / "Classic" for the game types
 *                 (01 §3a), and one line describing draws and missed numbers with the same
 *                 words as the Quick Test ("Draws: timed (every N seconds)", "Missed numbers:
 *                 mark for me after N seconds" …), never the word "auto" alone.
 * Depends on:     ../types, ./useLiveMatch (types)
 * Used by:        ./Lobby, ./MatchScreen, ../host/*
 * Spec:           docs/spec/01-game-design.md §3a, §5, §6
 */
import type { GameType } from '../types.js';
import type { MatchSummary } from './useLiveMatch.js';

export function gameTypeName(type: GameType): string {
  if (type === 'royale') return 'Battle royale';
  if (type === 'classicSeasons') return 'Classic with seasons';
  return 'Classic';
}

const seconds = (ms: number): string => String(Math.round(ms / 100) / 10);

export function drawLine(settings: MatchSummary['settings']): string {
  return settings.drawMode === 'auto'
    ? `Draws: timed (every ${seconds(settings.drawIntervalMs)} seconds)`
    : 'Draws: host presses Draw next';
}

export function missedLine(settings: MatchSummary['settings']): string {
  const rule = settings.missedNumbers;
  return rule.kind === 'autoMarkAfter'
    ? `Missed numbers: marked for you after ${seconds(rule.delayMs)} seconds`
    : 'Missed numbers: left open (tap later without bonus)';
}

export function rulesLine(match: MatchSummary): string {
  return `${drawLine(match.settings)} · ${missedLine(match.settings)}`;
}
