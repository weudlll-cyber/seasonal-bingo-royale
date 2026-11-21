/**
 * @file   apps/web/src/admin/changeText.ts
 * @module web/admin
 * @brief  An admin-area change in plain words, for the History: what changed, old → new.
 *
 * Responsibility: the names of the switches (also the Overview's labels), a settings change as
 *                 one line per value that changed (a value the version leaves out reads as the
 *                 default the server named; a preset's values through ./presetText),
 *                 maintenance switched on or off, and a match aborted with its reason. Unknown
 *                 actions read as their name.
 * Depends on:     ./presetText
 * Used by:        ./AdminHistory, ./AdminSwitches
 * Spec:           docs/concepts/admin-area.md §4 (History), §6
 */
import { presetLines } from './presetText.js';

export interface HistoryEntry {
  readonly id: number;
  readonly at: number;
  readonly actor: string | null;
  readonly action: string;
  readonly target: string;
  readonly diff: Readonly<Record<string, unknown>>;
  readonly undoable: boolean;
}

export type Defaults = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

// The Overview's switches (the `features` settings document).
export const SWITCH_NAMES: Readonly<Record<string, string>> = {
  guests: 'Guests may watch',
  emailVerification: 'Players must confirm their e-mail',
};

const valueText = (v: unknown): string =>
  typeof v === 'boolean' ? (v ? 'on' : 'off') : JSON.stringify(v);

const record = (v: unknown): Readonly<Record<string, unknown>> =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};

// "Guests may watch: on → off", one line per value the change touched.
function settingsLines(e: HistoryEntry, defaults: Defaults): string[] {
  const documentId = e.target.split('@')[0] ?? '';
  if (documentId.startsWith('preset:'))
    return presetLines(record(e.diff['from']), record(e.diff['to']));
  const base = defaults[documentId] ?? {};
  const from = { ...base, ...record(e.diff['from']) };
  const to = { ...base, ...record(e.diff['to']) };
  return [...new Set([...Object.keys(from), ...Object.keys(to)])]
    .filter((key) => JSON.stringify(from[key]) !== JSON.stringify(to[key]))
    .map((key) => `${SWITCH_NAMES[key] ?? key}: ${valueText(from[key])} → ${valueText(to[key])}`);
}

export function changeLines(e: HistoryEntry, defaults: Defaults): string[] {
  const reason = typeof e.diff['reason'] === 'string' ? e.diff['reason'] : '';
  switch (e.action) {
    case 'settings.change':
      return settingsLines(e, defaults);
    case 'maintenance.on':
      return [
        `Maintenance on${typeof e.diff['to'] === 'string' && e.diff['to'] !== '' ? `: ${e.diff['to']}` : ''}`,
      ];
    case 'maintenance.off':
      return ['Maintenance off'];
    case 'match.abort':
      return [`Match ${e.target} aborted: ${reason}`];
    default:
      return [e.action];
  }
}

export const commentOf = (e: HistoryEntry): string | null =>
  typeof e.diff['comment'] === 'string' ? e.diff['comment'] : null;
