/**
 * @file   apps/server/src/admin/presets.ts
 * @module server/admin
 * @brief  The presets: named rulesets per game type, kept as versioned settings documents.
 *
 * Responsibility: each preset is the settings document `preset:<id>` (./settings) holding its
 *                 name, game type, mode, status (draft, published, retired), when it was last
 *                 published, and its full ruleset. At start the server seeds one published
 *                 preset per built-in ruleset (today's rules) unless it exists, its id the
 *                 ruleset's name so far. A match created
 *                 without a chosen ruleset takes the most recently published preset of its game
 *                 type and mode (admin-area §8 (b)); the match freezes that copy, so a later
 *                 change never reaches it. `problem` is the one check every write passes: the
 *                 document parses (the full RulesetSchema with its cross-field rules), its
 *                 ruleset keeps the preset's game type and mode, and its game type and mode
 *                 keep at least one published preset; the Organizer's speeds fit its mode. A preset
 *                 stored before the Organizer's part existed gets `organizerDefaults` on reading.
 * Depends on:     zod, @sbr/contracts, ./settings
 * Used by:        ../http/app, ../http/routes/adminPresets, ../http/routes/adminSettings
 * Spec:           docs/concepts/admin-area.md §4 (Presets), §6, §8 (b), (k), §9 piece 3
 */
import {
  DEFAULT_RULESETS,
  GameTypeSchema,
  OrganizerSchema,
  organizerDefaults,
  RulesetSchema,
  speedProblem,
  type Organizer,
  type Ruleset,
} from '@sbr/contracts';
import { z } from 'zod';

import type { SettingsDocument, SettingsStore } from './settings.js';

export const PRESET_PREFIX = 'preset:';

export const PresetSchema = z.strictObject({
  name: z.string().trim().min(3).max(60),
  gameType: GameTypeSchema,
  mode: z.enum(['realtime', 'async']),
  status: z.enum(['draft', 'published', 'retired']),
  publishedAt: z.number().int().nullable(),
  ruleset: RulesetSchema,
  // The Organizer's part (piece 4); a preset stored before it gets the defaults on reading.
  organizer: OrganizerSchema.optional(),
});
export type Preset = z.infer<typeof PresetSchema> & { readonly organizer: Organizer };

// A stored preset, its Organizer part filled in; null when it does not parse.
function parsed(document: unknown): Preset | null {
  const p = PresetSchema.safeParse(document);
  if (!p.success) return null;
  return { ...p.data, organizer: p.data.organizer ?? organizerDefaults(p.data.ruleset) };
}

// The three speeds fit the preset's mode (01 §5, D12).
const speedsFit = (p: Preset): boolean =>
  Object.values(p.organizer.speedsMs).every((ms) => speedProblem(p.ruleset, ms) === null);

// The built-in rulesets, one published preset each, under the name a match has frozen with
// them so far (`matches.ruleset_name`), and a name for the admin area.
const BUILT_IN: Readonly<Record<string, string>> = {
  'royale-realtime': 'Battle royale',
  'royale-async': 'Asynchronous battle royale',
  'classic-seasons-realtime': 'Classic with seasons',
  'classic-realtime': 'Classic',
};

export class Presets {
  constructor(private readonly store: SettingsStore) {}

  async seed(): Promise<void> {
    for (const { name: id, ruleset } of DEFAULT_RULESETS) {
      const preset: Preset = {
        name: BUILT_IN[id] ?? id,
        gameType: ruleset.gameType,
        mode: ruleset.mode,
        status: 'published',
        publishedAt: 0,
        ruleset,
        organizer: organizerDefaults(ruleset),
      };
      await this.store.seed(`${PRESET_PREFIX}${id}`, preset);
    }
  }

  list(): { id: string; preset: Preset }[] {
    return this.store
      .documents(PRESET_PREFIX)
      .flatMap(([id, doc]) => {
        const p = parsed(doc);
        return p === null ? [] : [{ id: id.slice(PRESET_PREFIX.length), preset: p }];
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): Preset | null {
    return parsed(this.store.get(`${PRESET_PREFIX}${id}`));
  }

  // Every published preset, for the Organizer's page: live ones first (the page preselects
  // the first of a game type), then by id.
  open(): (Preset & { readonly id: string })[] {
    const live = (p: Preset): number => (p.mode === 'realtime' ? 0 : 1);
    return this.list()
      .filter((e) => e.preset.status === 'published')
      .sort((a, b) => live(a.preset) - live(b.preset))
      .map((e) => ({ ...e.preset, id: e.id }));
  }

  // A published preset the Organizer chose (the "Start a match" page); null otherwise.
  chosen(id: string): (Preset & { readonly id: string }) | null {
    const p = this.get(id);
    return p?.status === 'published' ? { ...p, id } : null;
  }

  // What a match created without a chosen ruleset is played with, the preset's id as the
  // name the match freezes (never the admin's name: ../http/routes/openRounds reads it); null:
  // the built-in ruleset.
  published(
    gameType: Ruleset['gameType'],
    mode: Ruleset['mode'],
  ): { name: string; ruleset: Ruleset } | null {
    const open = this.list().filter(
      ({ preset: p }) => p.gameType === gameType && p.mode === mode && p.status === 'published',
    );
    const last = open.sort((a, b) => (b.preset.publishedAt ?? 0) - (a.preset.publishedAt ?? 0))[0];
    return last === undefined ? null : { name: last.id, ruleset: last.preset.ruleset };
  }

  // What stops `document` from becoming preset `documentId`, or null (see the header).
  problem(documentId: string, document: SettingsDocument): 'invalid' | 'lastPublished' | null {
    const p = parsed(document);
    if (p === null || !speedsFit(p)) return 'invalid';
    const id = documentId.slice(PRESET_PREFIX.length);
    const before = this.get(id);
    const kept = before === null || (before.gameType === p.gameType && before.mode === p.mode);
    if (!kept || p.ruleset.gameType !== p.gameType || p.ruleset.mode !== p.mode) return 'invalid';
    if (p.status === 'published') return null;
    const another = this.list().some(
      (e) =>
        e.id !== id &&
        e.preset.status === 'published' &&
        e.preset.gameType === p.gameType &&
        e.preset.mode === p.mode,
    );
    return another ? null : 'lastPublished';
  }
}
