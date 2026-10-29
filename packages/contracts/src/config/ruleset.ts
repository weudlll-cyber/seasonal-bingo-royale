/**
 * @file   packages/contracts/src/config/ruleset.ts
 * @module contracts/config
 * @brief  The ruleset document (01 §4–§9 plus §3a): one zod schema for every mode.
 *
 * Responsibility: single source of truth for every gameplay configuration key, with
 *                 min/max bounds and a cross-field refinement that captures the
 *                 royale-vs-classic shape (classic forbids stages/cuts/jackpot and
 *                 requires `defaultPrizes`; royale forbids `defaultPrizes`).
 * Depends on:     zod, ./gameType, ./prizes
 * Used by:        apps/server (match creation, validation), apps/admin (editor),
 *                 defaults in ./defaults/*, future packages that persist the document, ../index
 * Spec:           docs/spec/01-game-design.md §3a, §4–§9; docs/spec/11-admin-panel.md §4
 */
import { z } from 'zod';

import { GameTypeSchema, isClassic } from './gameType.js';
import { BuiltinPrizeKeySchema, PrizeListSchema } from './prizes.js';

const ModeSchema = z.enum(['realtime', 'async']);
const MarkingModeSchema = z.enum(['auto', 'manual']);

const GeneralSchema = z.object({
  cardsPerPlayer: z.number().int().min(1).max(4),
  freeCenter: z.boolean(),
});

// Allowed realtime draw interval (01 §5): the ruleset value, and the interval a starter
// or host may set for `auto` draws, stay inside this range.
export const REALTIME_DRAW_INTERVAL_MS = Object.freeze({ min: 2_000, max: 60_000 });

// Missed-number delay a match starter gets by default under autoMarkAfter (01 §6); the
// chosen delay is never shorter than the ruleset speed window.
export const DEFAULT_AUTO_MARK_DELAY_MS = 3_000;

// Shortest timed-draw interval of a match (D12): 1 s longer than its longest tap time —
// the speed window, or the missed-number delay when "mark after N s" is chosen — and
// never below the realtime minimum. Host draws unlock after the same interval (D13).
const GAP_AFTER_TAP_TIME_MS = 1_000;

export function shortestDrawIntervalMs(
  speedWindowMs: number,
  autoMarkDelayMs: number | null,
): number {
  const longestTap = Math.max(speedWindowMs, autoMarkDelayMs ?? 0);
  return Math.max(REALTIME_DRAW_INTERVAL_MS.min, longestTap + GAP_AFTER_TAP_TIME_MS);
}

// Pause between royale rounds when the match waits on its own (D14): chosen at creation,
// 15 s by default (D21: the recap's three most important cards) and at least 3 s; the
// host may end it early. The other choice is "host starts the next round". The same for
// both royale defaults (realtime and async).
export const DEFAULT_ROUND_PAUSE_MS = 15_000;
export const MIN_ROUND_PAUSE_MS = 3_000;

// Start rules (01 §7.6): the countdown the players see before the first round, and how far
// ahead a set start time may lie (at least a minute, at most a week; form and server alike).
export const START_COUNTDOWN_MS = 10_000;
export const MIN_START_AHEAD_MS = 60_000;
export const MAX_START_AHEAD_MS = 7 * 24 * 60 * 60_000;

const DrawsSchema = z.object({
  intervalMsRealtime: z
    .number()
    .int()
    .min(REALTIME_DRAW_INTERVAL_MS.min)
    .max(REALTIME_DRAW_INTERVAL_MS.max),
  intervalMsAsync: z.number().int().min(60_000).max(86_400_000),
  // Quiet hours as half-open interval in local time. Null disables.
  quietHours: z
    .object({
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23),
    })
    .nullable(),
});

const MarkingSchema = z.object({
  mode: MarkingModeSchema,
  speedWindowMs: z.number().int().min(500).max(10_000),
});

// Keep every effect-type parameter block in one union; refine() enforces that the
// catalogue entries' parameters match the chosen type at the season level below.
const EffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('addPoints'), points: z.number().int().min(0).max(10_000) }),
  z.object({
    type: z.literal('multiplier'),
    factor: z.number().min(1).max(10),
    durationDraws: z.number().int().min(1).max(75),
  }),
  z.object({
    type: z.literal('growth'),
    pointsPerMark: z.number().int().min(1).max(100),
    durationDraws: z.number().int().min(1).max(75),
  }),
  z.object({
    type: z.literal('harvest'),
    scope: z.enum(['row', 'column', 'card']),
    pointsPerMarked: z.number().int().min(1).max(1_000),
  }),
  z.object({
    type: z.literal('shield'),
    rankMargin: z.number().int().min(0).max(50),
    charges: z.number().int().min(1).max(10),
  }),
  z.object({ type: z.literal('revealNext'), count: z.number().int().min(1).max(50) }),
]);
export type Effect = z.infer<typeof EffectSchema>;

const SeasonSchema = z.object({
  effect: EffectSchema,
  announce: z.boolean(),
});
const SeasonsSchema = z.object({
  spring: SeasonSchema,
  summer: SeasonSchema,
  autumn: SeasonSchema,
  winter: SeasonSchema,
});

const RoundEndSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('drawCount'), draws: z.number().int().min(1).max(75) }),
  z.object({ kind: z.literal('firstBingo'), graceDraws: z.number().int().min(0).max(10) }),
  z.object({
    kind: z.literal('bingoQuota'),
    quotaPercent: z.number().int().min(1).max(100),
  }),
  z.object({ kind: z.literal('firstFullHouse') }),
]);

const CutRuleSchema = z.object({
  keep: z.enum(['percent', 'count', 'scoreThreshold']),
  value: z.number().min(0),
  minSurvivors: z.number().int().min(2).max(200),
});

const ScoreCarrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('keep') }),
  z.object({ kind: z.literal('reset') }),
  z.object({ kind: z.literal('scaled'), factor: z.number().min(0).max(10) }),
]);

const StageSchema = z.object({
  kind: z.enum(['qualification', 'elimination', 'final']),
  rounds: z.number().int().min(1).max(10),
  roundEnd: RoundEndSchema,
  cut: CutRuleSchema.optional(),
  scoreCarry: ScoreCarrySchema,
  stageMultiplier: z.number().min(0.1).max(10),
  activePatterns: z.array(BuiltinPrizeKeySchema.or(z.string().min(1))).nonempty(),
});

const ScoringSchema = z.object({
  pointsPerMark: z.number().int().min(0).max(1_000),
  maxSpeedBonus: z.number().int().min(0).max(1_000),
  firstToPatternBonusPercent: z.number().int().min(0).max(500),
});

const JackpotSchema = z.object({
  base: z.number().int().min(0).max(100_000),
  growthPerRound: z.number().int().min(0).max(100_000),
  rollover: z.boolean(),
});

const SeasonCompleteSchema = z.object({
  points: z.number().int().min(0).max(10_000),
  effect: EffectSchema,
});

const LobbySchema = z.object({
  minPlayers: z.number().int().min(2).max(200),
  maxPlayers: z.number().int().min(2).max(200),
  openMsRealtime: z.number().int().min(60_000).max(86_400_000),
  openMsAsync: z.number().int().min(60_000).max(604_800_000),
  startRule: z.enum(['scheduled', 'whenFull', 'either']),
  lateJoin: z.boolean(),
});

const BASE_RULESET_SHAPE = {
  gameType: GameTypeSchema,
  mode: ModeSchema,
  countsForLeaderboard: z.boolean(),
  general: GeneralSchema,
  draws: DrawsSchema,
  marking: MarkingSchema,
  scoring: ScoringSchema,
  seasons: SeasonsSchema,
  lobby: LobbySchema,
  // Royale-only; classic rulesets must leave these out.
  stages: z.array(StageSchema).min(1).optional(),
  jackpot: JackpotSchema.optional(),
  seasonComplete: SeasonCompleteSchema.optional(),
  // Classic-only; royale rulesets must leave this out.
  defaultPrizes: PrizeListSchema.optional(),
};

type RulesetShape = z.infer<ReturnType<typeof z.object<typeof BASE_RULESET_SHAPE>>>;

// Collect classic-vs-royale issues as plain values first, so the superRefine body stays
// short enough for max-lines-per-function and keeps the refinement rules close together.
interface Issue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
}

function classicIssues(value: RulesetShape): readonly Issue[] {
  const issues: Issue[] = [];
  const forbid = (key: 'stages' | 'jackpot' | 'seasonComplete'): void => {
    if (value[key] !== undefined)
      issues.push({ path: [key], message: 'forbidden for classic types' });
  };
  forbid('stages');
  forbid('jackpot');
  forbid('seasonComplete');
  if (value.defaultPrizes === undefined) {
    issues.push({ path: ['defaultPrizes'], message: 'required for classic types' });
  }
  return issues;
}

function royaleIssues(value: RulesetShape): readonly Issue[] {
  const issues: Issue[] = [];
  if (value.defaultPrizes !== undefined) {
    issues.push({ path: ['defaultPrizes'], message: 'forbidden for royale' });
  }
  if (value.stages === undefined) issues.push({ path: ['stages'], message: 'required for royale' });
  if (value.jackpot === undefined)
    issues.push({ path: ['jackpot'], message: 'required for royale' });
  if (value.seasonComplete === undefined) {
    issues.push({ path: ['seasonComplete'], message: 'required for royale' });
  }
  if (value.marking.speedWindowMs >= value.draws.intervalMsRealtime) {
    issues.push({
      path: ['marking', 'speedWindowMs'],
      message: 'must be shorter than realtime draw interval',
    });
  }
  if (value.stages !== undefined && value.stages.at(-1)?.kind !== 'final') {
    issues.push({ path: ['stages'], message: 'last stage must be of kind "final"' });
  }
  return issues;
}

// A ruleset reads better when its royale-only and classic-only keys are expressed as a
// shape and refined, not as a discriminated union of two very large objects.
export const RulesetSchema = z.object(BASE_RULESET_SHAPE).superRefine((value, ctx) => {
  const issues = isClassic(value.gameType) ? classicIssues(value) : royaleIssues(value);
  for (const issue of issues) {
    ctx.addIssue({ code: 'custom', path: [...issue.path], message: issue.message });
  }
});

export type Ruleset = z.infer<typeof RulesetSchema>;
