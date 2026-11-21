/**
 * @file   apps/web/src/admin/changeText.ts
 * @module web/admin
 * @brief  An admin-area change in plain words, for the History: what changed, old → new.
 *
 * Responsibility: the names of the switches (also the Overview's labels), a settings change as
 *                 one line per value that changed (a value the version leaves out reads as the
 *                 default the server named; a preset's values through ./presetText),
 *                 maintenance switched on or off, a match aborted with its reason, and a
 *                 correction of a player's league points with its reason, and an account's role,
 *                 lock, second step or sessions changed. Unknown
 *                 actions read as their name.
 * Depends on:     @sbr/contracts (the League's, screen and Technical catalogues), ../game/labels,
 *                 ./presetText
 * Used by:        ./AdminHistory, ./AdminSwitches, ./LeagueCorrections
 * Spec:           docs/concepts/admin-area.md §4 (History), §6
 */
import { LEAGUE_CATALOGUE, SCREEN_CATALOGUE, TECHNICAL_CATALOGUE } from '@sbr/contracts';

import { pointsDelta } from '../game/labels.js';
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

// The names of the League's, the screen and the Technical values.
const CATALOGUES: Readonly<Record<string, { readonly label: string } | undefined>> = {
  ...LEAGUE_CATALOGUE,
  ...SCREEN_CATALOGUE,
  ...TECHNICAL_CATALOGUE,
};

// A switch's or a page value's name; else the key.
const nameOf = (key: string): string => SWITCH_NAMES[key] ?? CATALOGUES[key]?.label ?? key;

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
    .map((key) => `${nameOf(key)}: ${valueText(from[key])} → ${valueText(to[key])}`);
}

const roleName = (role: unknown): string => (role === 'game_admin' ? 'Admin' : 'Organizer');

// Players and accounts (admin-area §4): an account change by the account's name.
const ACCOUNT_LINES: Readonly<Record<string, (who: string, role: string) => string>> = {
  'account.role.give': (who, role) => `${who} made an ${role}`,
  'account.role.remove': (who, role) => `${who} is no longer an ${role}`,
  'account.lock': (who) => `${who} locked`,
  'account.unlock': (who) => `${who} unlocked`,
  'account.reset2fa': (who) => `Second step of ${who} reset`,
  'account.endSessions': (who) => `Sessions of ${who} ended`,
};

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
    case 'league.correct':
      return [`League points of ${e.target}: ${pointsDelta(Number(e.diff['delta']))} (${reason})`];
    default:
      return [ACCOUNT_LINES[e.action]?.(e.target, roleName(e.diff['role'])) ?? e.action];
  }
}

// When a change was made, as the History and the corrections show it.
export const when = (ms: number): string =>
  new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export const commentOf = (e: HistoryEntry): string | null =>
  typeof e.diff['comment'] === 'string' ? e.diff['comment'] : null;
