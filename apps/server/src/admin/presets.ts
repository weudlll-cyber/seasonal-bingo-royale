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
 *                 keep at least one published preset.
 * Depends on:     zod, @sbr/contracts, ./settings
 * Used by:        ../http/app, ../http/routes/adminPresets, ../http/routes/adminSettings
 * Spec:           docs/concepts/admin-area.md §4 (Presets), §6, §8 (b), (k), §9 piece 3
 */
import { DEFAULT_RULESETS, GameTypeSchema, RulesetSchema, type Ruleset } from '@sbr/contracts';
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
});
export type Preset = z.infer<typeof PresetSchema>;

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
      };
      await this.store.seed(`${PRESET_PREFIX}${id}`, preset);
    }
  }

  list(): { id: string; preset: Preset }[] {
    return this.store
      .documents(PRESET_PREFIX)
      .flatMap(([id, doc]) => {
        const p = PresetSchema.safeParse(doc);
        return p.success ? [{ id: id.slice(PRESET_PREFIX.length), preset: p.data }] : [];
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): Preset | null {
    const p = PresetSchema.safeParse(this.store.get(`${PRESET_PREFIX}${id}`));
    return p.success ? p.data : null;
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
    const next = PresetSchema.safeParse(document);
    if (!next.success) return 'invalid';
    const p = next.data;
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
