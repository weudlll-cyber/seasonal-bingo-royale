/**
 * @file   packages/contracts/src/config/presetCatalogue.ts
 * @module contracts/config
 * @brief  What each preset value does: its name, description, unit and warning, by path.
 *
 * Responsibility: one entry per ruleset value the admin area offers (admin-area §4: "description,
 *                 unit, ... warning"); `*` in a path stands for a stage index or a season. The
 *                 limits are not here: ./presetFields reads them from RulesetSchema. A value
 *                 without an entry is not offered (§8 (r): values the game does not read).
 * Depends on:     nothing
 * Used by:        ./presetFields
 * Spec:           docs/concepts/admin-area.md §4 (Presets), §8 (r), §9 piece 3
 */

export interface Entry {
  readonly label: string;
  readonly description: string;
  readonly unit?: string;
  readonly scale?: number;
  readonly warning?: string;
  // Read only by matches of this mode (the other mode's value is left out, §8 (r)).
  readonly mode?: 'realtime' | 'async';
}

// What each value does, by path pattern (`*` stands for a stage index or a season).
export const CATALOGUE: Readonly<Record<string, Entry>> = {
  'draws.intervalMsRealtime': {
    mode: 'realtime',
    label: 'Time between numbers',
    description: 'How many seconds pass between two numbers when the draws are timed.',
    unit: 's',
    scale: 1000,
  },
  'draws.intervalMsAsync': {
    mode: 'async',
    label: 'Time between numbers',
    description: 'How many minutes pass between two numbers in an asynchronous match.',
    unit: 'min',
    scale: 60_000,
  },
  'draws.quietHours.startHour': {
    mode: 'async',
    label: 'Quiet hours from',
    description: 'From this hour no number is drawn (in the host’s time zone).',
    unit: 'h',
  },
  'draws.quietHours.endHour': {
    mode: 'async',
    label: 'Quiet hours until',
    description: 'At this hour the draws go on again.',
    unit: 'h',
  },
  'marking.mode': {
    label: 'Marking',
    description:
      'manual: players tap the drawn numbers; auto: every drawn number is marked for them.',
    warning: 'Changes how everyone plays.',
  },
  'marking.speedWindowMs': {
    label: 'Speed window',
    description: 'How long after a draw a tap still earns the speed bonus.',
    unit: 's',
    scale: 1000,
    warning: 'Must stay shorter than the time between numbers.',
  },
  'general.cardsPerPlayer': {
    label: 'Cards per player',
    description: 'How many cards each player gets.',
    unit: 'cards',
  },
  'general.freeCenter': {
    label: 'Free centre',
    description: 'Whether the middle cell is free (marked from the start).',
  },
  'scoring.pointsPerMark': {
    label: 'Points per marked number',
    description: 'Points a player gets for each marked number.',
    unit: 'points',
  },
  'scoring.maxSpeedBonus': {
    label: 'Largest speed bonus',
    description: 'The most extra points a very fast tap earns.',
    unit: 'points',
  },
  'scoring.firstToPatternBonusPercent': {
    label: 'Bonus for the first to a pattern',
    description:
      'Extra points, as a share of the pattern’s points, for whoever completes it first.',
    unit: '%',
  },
  countsForLeaderboard: {
    label: 'Counts for the league',
    description: 'Whether a new match counts for the league unless the organizer changes it.',
  },
  'seasons.*.announce': {
    label: 'Announce',
    description: 'Whether players see a notice when the season’s effect starts.',
  },
  'seasons.*.effect.points': {
    label: 'Points',
    description: 'Points the season’s effect adds.',
    unit: 'points',
  },
  'seasons.*.effect.factor': {
    label: 'Multiplier',
    description: 'What the season’s effect multiplies a player’s new points by.',
    unit: '×',
  },
  'seasons.*.effect.durationDraws': {
    label: 'Lasts',
    description: 'For how many draws the season’s effect lasts.',
    unit: 'draws',
  },
  'seasons.*.effect.pointsPerMark': {
    label: 'Points per mark',
    description: 'Extra points per marked number while the effect lasts.',
    unit: 'points',
  },
  'seasons.*.effect.scope': {
    label: 'Counts in',
    description: 'Where the marked cells are counted: the row, the column or the whole card.',
  },
  'seasons.*.effect.pointsPerMarked': {
    label: 'Points per marked cell',
    description: 'Points for each marked cell where it counts.',
    unit: 'points',
  },
  'seasons.*.effect.rankMargin': {
    label: 'Saves within',
    description: 'How many places below the cut the shield still saves a player.',
    unit: 'places',
  },
  'seasons.*.effect.charges': {
    label: 'Uses',
    description: 'How many cuts the shield can save a player from.',
    unit: 'times',
  },
  'seasons.*.effect.count': {
    label: 'Shows',
    description: 'How many coming numbers the effect reveals.',
    unit: 'numbers',
  },
  'seasonComplete.points': {
    label: 'Season Complete points',
    description: 'Points for collecting all four seasons in one match.',
    unit: 'points',
  },
  'stages.*.rounds': {
    label: 'Rounds',
    description: 'How many rounds the stage has.',
    unit: 'rounds',
  },
  'stages.*.roundEnd.draws': {
    label: 'Numbers per round',
    description: 'How many numbers are drawn in each round of the stage.',
    unit: 'numbers',
  },
  'stages.*.roundEnd.graceDraws': {
    label: 'Numbers after the first bingo',
    description: 'How many more numbers come after the first bingo before the round ends.',
    unit: 'numbers',
  },
  'stages.*.roundEnd.quotaPercent': {
    label: 'Bingo quota',
    description: 'The round ends once this share of the players has a bingo.',
    unit: '%',
  },
  'stages.*.cut.value': {
    label: 'Cut keeps',
    description:
      'How many go on after the stage (a share, a number of players or a score, as the cut says).',
    warning: 'Changes how many players reach the final.',
  },
  'stages.*.cut.minSurvivors': {
    label: 'At least this many go on',
    description: 'The cut never keeps fewer players than this.',
    unit: 'players',
  },
  'stages.*.scoreCarry.factor': {
    label: 'Points carried over',
    description: 'What the points of this stage are multiplied by in the next.',
    unit: '×',
  },
  'stages.*.stageMultiplier': {
    label: 'Point multiplier',
    description: 'What every point in this stage is multiplied by.',
    unit: '×',
  },
  'jackpot.base': {
    label: 'Jackpot',
    description: 'The jackpot a match starts with.',
    unit: 'points',
  },
  'jackpot.growthPerRound': {
    label: 'Jackpot growth',
    description: 'How much the jackpot grows each round nobody wins it.',
    unit: 'points',
  },
  'jackpot.rollover': {
    label: 'Jackpot rolls over',
    description: 'Whether a jackpot nobody won carries into the next round.',
  },
  'lobby.minPlayers': {
    label: 'Fewest players to start',
    description: 'A match does not start with fewer players than this.',
    unit: 'players',
  },
  'lobby.openMsAsync': {
    mode: 'async',
    label: 'Asynchronous lobby open for',
    description:
      'How long an asynchronous match waits for players before it starts or is cancelled.',
    unit: 'h',
    scale: 3_600_000,
  },
};
