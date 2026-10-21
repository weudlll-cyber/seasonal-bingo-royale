/**
 * @file   apps/server/src/match/records.ts
 * @module server/match
 * @brief  A `matches` row as the engine's MatchRecord (04 §3.3).
 *
 * Responsibility: the row type of sbr.matches and its mapping to MatchRecord: the frozen
 *                 ruleset document, the starter's settings (marking, missed numbers, draw
 *                 mode and seconds, pause between rounds) and the status. The seed never leaves the database here.
 * Depends on:     @sbr/application (types), @sbr/contracts (types), @sbr/domain (types)
 * Used by:        ./pgMatchStore, ../http/routes/matches
 * Spec:           docs/spec/04-database-design.md §3.3
 */
import type { DrawMode, MatchRecord, MatchStatus } from '@sbr/application';
import type { Ruleset } from '@sbr/contracts';
import type { GameType, MarkingMode } from '@sbr/domain';

export interface MatchRow {
  id: string;
  code: string;
  title: string;
  game_type: GameType;
  ruleset_name: string;
  ruleset: Ruleset;
  status: MatchStatus;
  max_players: number;
  prizes: string[];
  counts_for_leaderboard: boolean;
  marking_mode: MarkingMode;
  draw_mode: DrawMode;
  missed_numbers: 'autoMarkAfter' | 'noAutoMark';
  auto_mark_delay_ms: number;
  draw_interval_ms: number;
  // NULL: the host starts the next royale round (D14).
  round_pause_ms: number | null;
  created_by: string | null;
  starts_at: Date | null;
}

export function recordFrom(row: MatchRow): MatchRecord {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    gameType: row.game_type,
    rulesetName: row.ruleset_name,
    ruleset: row.ruleset,
    status: row.status,
    maxPlayers: row.max_players,
    prizes: row.prizes,
    countsForLeaderboard: row.counts_for_leaderboard,
    settings: {
      markingMode: row.marking_mode,
      missedNumbers:
        row.missed_numbers === 'autoMarkAfter'
          ? { kind: 'autoMarkAfter', delayMs: row.auto_mark_delay_ms }
          : { kind: 'noAutoMark' },
      drawMode: row.draw_mode,
      drawIntervalMs: row.draw_interval_ms,
      roundPause:
        row.round_pause_ms === null ? { kind: 'host' } : { kind: 'wait', ms: row.round_pause_ms },
    },
    createdBy: row.created_by,
    startsAt: row.starts_at === null ? null : row.starts_at.getTime(),
  };
}
