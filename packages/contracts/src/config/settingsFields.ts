/**
 * @file   packages/contracts/src/config/settingsFields.ts
 * @module contracts/config
 * @brief  The fields of a flat settings document, generated from its zod schema and a catalogue.
 *
 * Responsibility: for a settings document whose values sit at the top level (the League, and
 *                 the sections that follow), one field per catalogue key: its name, what
 *                 changing it does, unit and scale, kind (number, yes/no, choice, text) and the
 *                 min and max read from the schema ("technical limit"), the same way
 *                 ./presetFields does for a preset (admin-area §9 piece 3, "value forms
 *                 generated from the schema").
 * Depends on:     zod, ./presetCatalogue (types), ./presetFields (kindOf, limitsOf, types)
 * Used by:        ../index; apps/server (admin League)
 * Spec:           docs/concepts/admin-area.md §4, §9 pieces 3 and 5
 */
import type { z } from 'zod';

import type { Entry } from './presetCatalogue.js';
import { kindOf, limitsOf, type PresetField } from './presetFields.js';

export type SettingField = Omit<PresetField, 'tab'>;

export function settingsFields(
  schema: z.ZodObject,
  value: Readonly<Record<string, unknown>>,
  catalogue: Readonly<Record<string, Entry>>,
): SettingField[] {
  return Object.entries(catalogue).flatMap(([key, entry]) => {
    const leaf = schema.shape[key] as z.ZodType | undefined;
    if (leaf === undefined) return [];
    const kind = kindOf(value[key], leaf);
    return [
      {
        path: key,
        label: entry.label,
        description: entry.description,
        kind,
        unit: entry.unit ?? '',
        scale: entry.scale ?? 1,
        ...limitsOf(leaf, kind),
        ...(entry.warning === undefined ? {} : { warning: entry.warning }),
      },
    ];
  });
}
