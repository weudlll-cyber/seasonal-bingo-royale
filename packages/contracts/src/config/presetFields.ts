/**
 * @file   packages/contracts/src/config/presetFields.ts
 * @module contracts/config
 * @brief  The values of a preset an admin may change, generated from the ruleset's schema.
 *
 * Responsibility: `presetFields(ruleset)` lists every value of that ruleset the admin area
 *                 offers (admin-area §4 "Presets"), grouped in tabs: its path, name, what
 *                 changing it does, unit, kind (number, yes/no, choice), min and max read from
 *                 RulesetSchema itself ("technical limit"), and a warning where one is needed.
 *                 Paths follow the ruleset as it is: the stages it has, each season's current
 *                 effect. Structure (effect types, the stage list, round-end kinds, patterns)
 *                 and values the game does not read (§8 (r): lobby.maxPlayers, openMsRealtime,
 *                 startRule, lateJoin) are not offered. `readPath`/`writePath` read and set one;
 *                 `presetPathName` names one path for the History. The preset's part for the
 *                 Organizer (./organizer) gets its fields the same way, in the tab "organizer".
 * Depends on:     zod, ./organizer, ./presetCatalogue, ./ruleset
 * Used by:        ../index; apps/server (admin presets), apps/web (types)
 * Spec:           docs/concepts/admin-area.md §4, §8 (j), (r), §9 pieces 3 and 4; admin-values.md
 *                 part A
 */
import { z } from 'zod';

import { OrganizerSchema, speedRange, type Organizer } from './organizer.js';
import { CATALOGUE, type Entry } from './presetCatalogue.js';
import { RulesetSchema, type Ruleset } from './ruleset.js';

export type PresetTab =
  'organizer' | 'draws' | 'marking' | 'scoring' | 'seasons' | 'stages' | 'jackpot' | 'lobby';

export interface PresetField {
  readonly path: string;
  readonly tab: PresetTab;
  readonly label: string;
  readonly description: string;
  readonly kind: 'number' | 'boolean' | 'choice' | 'text';
  readonly options?: readonly string[];
  // Shown in this unit: the stored number divided by `scale` (milliseconds as seconds).
  readonly unit: string;
  readonly scale: number;
  // In stored units; from the schema, so a technical limit.
  readonly min?: number;
  readonly max?: number;
  readonly warning?: string;
}

const TABS: readonly [string, PresetTab][] = [
  ['draws', 'draws'],
  ['marking', 'marking'],
  ['general', 'scoring'],
  ['scoring', 'scoring'],
  ['countsForLeaderboard', 'lobby'],
  ['seasons', 'seasons'],
  ['seasonComplete', 'seasons'],
  ['stages', 'stages'],
  ['jackpot', 'jackpot'],
  ['lobby', 'lobby'],
  ['organizer', 'organizer'],
];

// The root of the Organizer's paths ("organizer.players.max"), beside the ruleset's.
const ORGANIZER_ROOT = z.object({ organizer: OrganizerSchema });

export function readPath(value: unknown, path: string): unknown {
  let at: unknown = value;
  for (const key of path.split('.')) {
    if (at === null || typeof at !== 'object') return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at;
}

// A copy of `value` with one path set (objects and arrays copied along the way).
export function writePath(value: unknown, path: string, next: unknown): unknown {
  const [key = '', ...rest] = path.split('.');
  const here = (
    Array.isArray(value) ? [...(value as unknown[])] : { ...(value as object) }
  ) as Record<string, unknown>;
  here[key] = rest.length === 0 ? next : writePath(here[key], rest.join('.'), next);
  return here;
}

type Schema = z.ZodType;

// The schema of one path, following the ruleset's current value through unions.
function schemaAt(schema: Schema, value: unknown, key: string): Schema | null {
  const s = schema as unknown as {
    shape?: Record<string, Schema>;
    element?: Schema;
    options?: Schema[];
    unwrap?: () => Schema;
  };
  // An array's element first: zod 4 arrays also have `unwrap`.
  if (s.element !== undefined) return s.element;
  if (s.unwrap !== undefined && s.shape === undefined && s.options === undefined)
    return schemaAt(s.unwrap(), value, key);
  if (s.options !== undefined) {
    const kind = readPath(value, 'type') ?? readPath(value, 'kind');
    const match = s.options.find((o) => {
      const shape = (o as unknown as { shape: Record<string, { value?: unknown }> }).shape;
      return (shape['type'] ?? shape['kind'])?.value === kind;
    });
    return match === undefined ? null : schemaAt(match, value, key);
  }
  return s.shape?.[key] ?? null;
}

// The schema of a path and the preset's value there; null when the preset has none.
function leafAt(root: Root, path: string): { schema: Schema; value: unknown } | null {
  const organizer = path.startsWith('organizer.');
  let schema: Schema | null = organizer ? ORGANIZER_ROOT : RulesetSchema;
  let at: unknown = organizer ? { organizer: root.organizer } : root.ruleset;
  for (const key of path.split('.')) {
    if (schema === null) return null;
    schema = schemaAt(schema, at, key);
    at = readPath(at, key);
  }
  return schema === null || at === undefined || at === null ? null : { schema, value: at };
}

// What the leaf's schema says: the choices of an enum, the min and max of a number.
function limitsOf(schema: Schema, kind: PresetField['kind']) {
  const leaf = schema as unknown as {
    minValue?: number | null;
    maxValue?: number | null;
    maxLength?: number | null;
    options?: unknown[];
  };
  const options = kind === 'choice' && Array.isArray(leaf.options) ? leaf.options : null;
  return {
    ...(options === null
      ? {}
      : { options: options.map((o) => (typeof o === 'string' ? o : JSON.stringify(o))) }),
    ...(typeof leaf.minValue === 'number' ? { min: leaf.minValue } : {}),
    ...(typeof leaf.maxValue === 'number' ? { max: leaf.maxValue } : {}),
    ...(kind === 'text' && typeof leaf.maxLength === 'number' ? { max: leaf.maxLength } : {}),
  };
}

const kindOf = (v: unknown, schema: Schema): PresetField['kind'] => {
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  return Array.isArray((schema as unknown as { options?: unknown }).options) ? 'choice' : 'text';
};

interface Root {
  readonly ruleset: Ruleset;
  readonly organizer: Organizer | undefined;
}

function fieldOf(root: Root, path: string, entry: Entry): PresetField | null {
  const leaf = leafAt(root, path);
  if (leaf === null) return null;
  const kind = kindOf(leaf.value, leaf.schema);
  const shown = root.ruleset.mode === 'async' ? (entry.asyncUnit ?? entry) : entry;
  return {
    path,
    tab: TABS.find(([top]) => path.split('.')[0] === top)?.[1] ?? 'lobby',
    label: entry.label,
    description: entry.description,
    kind,
    unit: shown.unit ?? '',
    scale: shown.scale ?? 1,
    ...limitsOf(leaf.schema, kind),
    // A speed's limit is its mode's, not the schema's range of both modes.
    ...(path.startsWith('organizer.speedsMs.') ? speedRange(root.ruleset) : {}),
    ...(entry.warning === undefined ? {} : { warning: entry.warning }),
  };
}

// Every catalogue path that exists in this ruleset, with `*` filled in.
function pathsOf(ruleset: Ruleset, pattern: string): string[] {
  if (!pattern.includes('*')) return [pattern];
  const [head = '', tail = ''] = pattern.split('.*.');
  const list = readPath(ruleset, head);
  const keys = Array.isArray(list) ? list.map((_x, i) => String(i)) : Object.keys(list ?? {});
  return keys.map((k) => `${head}.${k}.${tail}`);
}

// The name, unit and scale of one ruleset path, for the History ("stages.1.rounds").
export function presetPathName(path: string): Pick<PresetField, 'label' | 'unit' | 'scale'> | null {
  const pattern = path.replace(/^(seasons|stages)\.[^.]+\./, '$1.*.');
  const entry = CATALOGUE[pattern];
  if (entry === undefined) return null;
  return { label: entry.label, unit: entry.unit ?? '', scale: entry.scale ?? 1 };
}

// The preset's fields; the Organizer's part only when the preset has one.
export function presetFields(ruleset: Ruleset, organizer?: Organizer): PresetField[] {
  const root = { ruleset, organizer };
  return Object.entries(CATALOGUE).flatMap(([pattern, entry]) =>
    (entry.mode ?? ruleset.mode) !== ruleset.mode
      ? []
      : pathsOf(ruleset, pattern).flatMap((path) => {
          const field = fieldOf(root, path, entry);
          return field === null ? [] : [field];
        }),
  );
}
