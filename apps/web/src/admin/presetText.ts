/**
 * @file   apps/web/src/admin/presetText.ts
 * @module web/admin
 * @brief  A preset's values and changes in plain words, for the Presets page and the History.
 *
 * Responsibility: a stored value in the unit the page shows it in ("3 s", "on", "manual"),
 *                 where a value sits ("Stage 2 · ", "Spring · "), a preset's status and kind in
 *                 words, and a preset change as one line per value it touched ("Royale ·
 *                 Time between numbers: 3 s → 9 s"); a new preset (a duplicate) reads as one
 *                 line. Names come from @sbr/contracts presetPathName, the same catalogue the
 *                 server builds the fields from.
 * Depends on:     @sbr/contracts (presetPathName), ../game/labels (gameTypeName)
 * Used by:        ./changeText, ./AdminPresets, ./PresetEditor
 * Spec:           docs/concepts/admin-area.md §4 (Presets, History), §6, §9 piece 3
 */
import { presetPathName } from '@sbr/contracts';

import { gameTypeName } from '../game/labels.js';

export const STATUS_NAMES: Readonly<Record<string, string>> = {
  draft: 'Draft',
  published: 'Published',
  retired: 'Retired',
};

export const kindOf = (p: { readonly gameType: string; readonly mode: string }): string =>
  `${gameTypeName(p.gameType as Parameters<typeof gameTypeName>[0])}${p.mode === 'async' ? ' · asynchronous' : ''}`;

// "3 s", "on", "manual": a stored value in the unit the page shows.
export function shownValue(v: unknown, unit = '', scale = 1): string {
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (typeof v === 'string') return v;
  if (typeof v !== 'number') return v === undefined ? '—' : JSON.stringify(v);
  const n = Number((v / scale).toFixed(3));
  return unit === '' ? String(n) : `${String(n)} ${unit}`;
}

// "Stage 2 · ", "Spring · ": where a stage's or a season's value sits.
export function placeOf(path: string): string {
  const [top, second] = path.split('.');
  if (top === 'stages') return `Stage ${String(Number(second) + 1)} · `;
  if (top === 'seasons' && second !== undefined)
    return `${second.charAt(0).toUpperCase()}${second.slice(1)} · `;
  return '';
}

function leaves(value: unknown, prefix = ''): [string, unknown][] {
  if (value === null || typeof value !== 'object') return prefix === '' ? [] : [[prefix, value]];
  return Object.entries(value).flatMap(([k, v]) => leaves(v, prefix === '' ? k : `${prefix}.${k}`));
}

const TOP_NAMES: Readonly<Record<string, string>> = { name: 'Name', status: 'Status' };

// One line per value the change touched; when it was published is left out.
export function presetLines(
  from: Readonly<Record<string, unknown>>,
  to: Readonly<Record<string, unknown>>,
): string[] {
  const name = typeof to['name'] === 'string' ? to['name'] : 'Preset';
  if (Object.keys(from).length === 0) return [`New preset: ${name}`];
  const a = new Map(leaves(from));
  const b = new Map(leaves(to));
  return [...new Set([...a.keys(), ...b.keys()])]
    .filter((k) => k !== 'publishedAt' && JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k)))
    .map((k) => {
      const path = k.startsWith('ruleset.') ? k.slice('ruleset.'.length) : k;
      const n = presetPathName(path);
      const show = (v: unknown) =>
        path === 'status' && typeof v === 'string'
          ? (STATUS_NAMES[v] ?? v)
          : shownValue(v, n?.unit, n?.scale);
      const label = n?.label ?? TOP_NAMES[path] ?? path;
      return `${name} · ${placeOf(path)}${label}: ${show(a.get(k))} → ${show(b.get(k))}`;
    });
}
