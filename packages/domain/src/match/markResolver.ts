/**
 * @file   packages/domain/src/match/markResolver.ts
 * @module domain/match
 * @brief  Compute the events produced by marking one cell (01 §8.1–§8.5).
 *
 * Responsibility: given the current state and the cell being marked, return the
 *                 chronological event list: `cellMarked` with points, `seasonActivated`
 *                 when the cell is a royale season cell, `patternScored` for royale or
 *                 `classicPrizeAwarded` for classic for every newly completed prize key,
 *                 `seasonCompleteFired` when all four seasons are now active, and
 *                 `jackpotClaimed` when a full house + Season Complete land in the same
 *                 royale round. Points are multiplied by the stage multiplier. Pure.
 * Depends on:     ../card/patterns, ../scoring/*, ../seasons/*, ../draw/pool, ./matchState,
 *                 ./events
 * Used by:        ./decide, ../index, ./decideAutoMark
 * Spec:           docs/spec/01-game-design.md §8.1–§8.5
 */
import { completedPrizeKeys } from '../card/patterns.js';
import { scoreMark } from '../scoring/basePoints.js';
import { scorePattern } from '../scoring/patternScoring.js';
import { applyEffect } from '../seasons/applyEffect.js';
import { markSeasonActivated, INITIAL_EFFECT_STATE } from '../seasons/effectState.js';
import { onMarkInsideGrowth } from '../seasons/tickEffects.js';
import type { EffectState } from '../seasons/effectState.js';
import { checkSeasonComplete } from '../seasons/seasonComplete.js';
import { SEASON_NAMES } from '../draw/pool.js';
import type { SeasonName } from '../draw/pool.js';
import type { MatchState, RoundState } from './matchState.js';
import type {
  CellMarked,
  ClassicPrizeAwarded,
  DomainEvent,
  JackpotClaimed,
  PatternScored,
  SeasonActivated,
  SeasonCompleteFired,
} from './events.js';

export interface MarkInput {
  readonly accountId: string;
  readonly cardIndex: number;
  readonly cellIndex: number;
  readonly inSpeedWindow: boolean;
  readonly speedBonus: number;
}

// A struct passed between the helpers below so each one keeps ≤4 parameters.
interface Context {
  readonly state: MatchState;
  readonly round: RoundState;
  readonly input: MarkInput;
}

export function buildMarkEvents(state: MatchState, input: MarkInput): readonly DomainEvent[] {
  const round = state.currentRound;
  const player = state.players[input.accountId];
  const marks = round?.cards[input.accountId]?.[input.cardIndex];
  if (round === null || player === undefined || marks === undefined) return [];
  const cell = marks.card.cells[input.cellIndex];
  if (cell === undefined || marks.marks[input.cellIndex] === true) return [];
  const ctx: Context = { state, round, input };
  const events: DomainEvent[] = [buildMarkEvent(cell.kind === 'free', player.effects, ctx)];
  const effects = effectsAfterMark(cell.kind === 'free', player.effects);
  const activation = buildActivation(marks.card.seasonCells, effects, ctx);
  if (activation !== null) events.push(activation.event);
  const nextEffects = activation === null ? effects : activation.nextEffects;
  const projected = withMarked(marks.marks, input.cellIndex);
  const prizeEvents = prizeEventsFor(ctx, projected, nextEffects, marks.scoredPrizes);
  events.push(...prizeEvents);
  const sc = seasonCompleteFor(ctx, player.seasonCompleteFired, nextEffects.seasonsActivated);
  if (sc !== null) events.push(sc);
  const jackpot = jackpotFor(ctx, prizeEvents, sc !== null);
  if (jackpot !== null) events.push(jackpot);
  return events;
}

// Progressive scoring (01 §7.2): every point earned in a stage is multiplied by its
// stageMultiplier. Events carry the multiplied value, so replay and clients just add.
function staged(ctx: Context, points: number): number {
  return Math.round(points * ctx.round.stage.stageMultiplier);
}

function buildMarkEvent(isFree: boolean, effects: EffectState, ctx: Context): CellMarked {
  const points = isFree
    ? 0
    : scoreMark({ pointsPerMark: ctx.state.ruleset.pointsPerMark }, effects) + windowBonus(ctx);
  return {
    type: 'cellMarked',
    accountId: ctx.input.accountId,
    cardIndex: ctx.input.cardIndex,
    cellIndex: ctx.input.cellIndex,
    markPoints: staged(ctx, points),
  };
}

// The speed bonus is earned only by a tap inside the speed window (01 §6); a late tap
// or an auto-mark scores the base points alone, whatever bonus the caller passed.
function windowBonus(ctx: Context): number {
  return ctx.input.inSpeedWindow ? Math.max(0, Math.round(ctx.input.speedBonus)) : 0;
}

function effectsAfterMark(isFree: boolean, effects: EffectState): EffectState {
  return !isFree && effects.growth !== null ? onMarkInsideGrowth(effects) : effects;
}

function buildActivation(
  seasonCells: readonly number[] | null,
  effects: EffectState,
  ctx: Context,
): { readonly event: SeasonActivated; readonly nextEffects: EffectState } | null {
  // Season effects belong to royale only; in classicSeasons a symbol cell is just a cell
  // to mark (01 §3a).
  if (ctx.state.gameType !== 'royale') return null;
  const season = seasonForCellIndex(ctx.input.cellIndex, seasonCells);
  if (season === null) return null;
  if ((effects.seasonsActivated & bitFor(season)) !== 0) return null;
  const applied = applyEffect(effects, ctx.state.ruleset.seasons[season].effect, {
    markedCellsInScope: 0,
  });
  const nextEffects = markSeasonActivated(applied.state, season);
  return {
    event: {
      type: 'seasonActivated',
      accountId: ctx.input.accountId,
      season,
      instantPoints: staged(ctx, applied.instantPoints),
    },
    nextEffects,
  };
}

function seasonForCellIndex(
  cellIndex: number,
  seasonCells: readonly number[] | null,
): SeasonName | null {
  if (seasonCells === null) return null;
  const idx = seasonCells.indexOf(cellIndex);
  return idx >= 0 ? (SEASON_NAMES[idx] ?? null) : null;
}

function bitFor(season: SeasonName): number {
  return season === 'spring' ? 1 : season === 'summer' ? 2 : season === 'autumn' ? 4 : 8;
}

function withMarked(marks: readonly boolean[], index: number): readonly boolean[] {
  const next = marks.slice();
  next[index] = true;
  return next;
}

function prizeEventsFor(
  ctx: Context,
  projected: readonly boolean[],
  effects: EffectState,
  alreadyScored: readonly string[],
): readonly (PatternScored | ClassicPrizeAwarded)[] {
  const completed = completedPrizeKeys(projected);
  const relevant =
    ctx.state.gameType === 'royale' ? ctx.round.stage.activePatterns : ctx.state.tickedPrizes;
  const active = new Set(relevant);
  const already = new Set([...alreadyScored, ...classicPrizesClosed(ctx.round)]);
  const out: (PatternScored | ClassicPrizeAwarded)[] = [];
  for (const key of completed) {
    if (!active.has(key) || already.has(key)) continue;
    out.push(
      ctx.state.gameType === 'royale' ? royalePattern(ctx, effects, key) : classicPrize(ctx, key),
    );
    already.add(key);
  }
  return out;
}

// A classic prize is decided when the speed window of the draw that first completed it
// closes; until then everyone who completes it wins it too (01 §3a.1, D10).
function classicPrizesClosed(round: RoundState): readonly string[] {
  return round.classicAwards
    .filter((a) => a.drawIndex <= round.windowClosedThrough)
    .map((a) => a.prizeKey);
}

function royalePattern(ctx: Context, effects: EffectState, key: string): PatternScored {
  const first = ctx.round.firstToPrize[key] === undefined;
  const points = scorePattern(
    {
      pointsByKey: ctx.state.ruleset.pointsByPrizeKey,
      firstToPatternBonusPercent: ctx.state.ruleset.firstToPatternBonusPercent,
    },
    { prizeKey: key, isFirstInRound: first, effects },
  );
  return {
    type: 'patternScored',
    accountId: ctx.input.accountId,
    cardIndex: ctx.input.cardIndex,
    prizeKey: key,
    points: staged(ctx, points),
    firstInRound: first,
  };
}

function classicPrize(ctx: Context, key: string): ClassicPrizeAwarded {
  return {
    type: 'classicPrizeAwarded',
    accountId: ctx.input.accountId,
    prizeKey: key,
    drawIndex: Math.max(0, ctx.round.draws.length - 1),
  };
}

// Season Complete is royale only (01 §3a: no Season Complete bonus in classic types).
function seasonCompleteFor(
  ctx: Context,
  alreadyFired: boolean,
  seasonsBitmask: number,
): SeasonCompleteFired | null {
  if (ctx.state.gameType !== 'royale') return null;
  const r = checkSeasonComplete(
    { ...INITIAL_EFFECT_STATE, seasonsActivated: seasonsBitmask },
    alreadyFired,
    { points: ctx.state.ruleset.seasonComplete.points },
  );
  const accountId = ctx.input.accountId;
  return r.fires ? { type: 'seasonCompleteFired', accountId, points: staged(ctx, r.points) } : null;
}

function jackpotFor(
  ctx: Context,
  prizeEvents: readonly (PatternScored | ClassicPrizeAwarded)[],
  seasonCompleteThisMark: boolean,
): JackpotClaimed | null {
  if (ctx.state.gameType !== 'royale' || ctx.state.jackpot.claimedBy !== null) return null;
  const player = ctx.state.players[ctx.input.accountId];
  if (player === undefined) return null;
  const fullHouseThisMark = prizeEvents.some(
    (e) => e.type === 'patternScored' && e.prizeKey === 'fullCard',
  );
  const fullHouseInThisRound =
    fullHouseThisMark || ctx.round.fullHouseBy.includes(ctx.input.accountId);
  // 01 §8.5: Season Complete AND full house must occur in the SAME round.
  const scInThisRound =
    seasonCompleteThisMark ||
    (player.seasonCompleteFired && player.seasonCompleteRound === ctx.round.roundIndex);
  if (!(fullHouseInThisRound && scInThisRound)) return null;
  const value =
    ctx.state.ruleset.jackpot.base +
    ctx.state.ruleset.jackpot.growthPerRound * ctx.state.jackpot.unclaimedRounds;
  return {
    type: 'jackpotClaimed',
    accountId: ctx.input.accountId,
    roundIndex: ctx.round.roundIndex,
    value,
  };
}
