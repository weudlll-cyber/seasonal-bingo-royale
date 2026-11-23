/**
 * @file   apps/server/src/http/routes/startPresets.ts
 * @module server/http
 * @brief  The presets as the Organizer sees them, and a new match's rules from its preset.
 *
 * Responsibility: GET /api/v1/presets: the published presets with only what the "Start a match"
 *                 page needs (admin-area §3). `presetInput` turns a POST /matches body into the
 *                 engine's input: with `preset` (and `speed`) the published preset's rules, its
 *                 speed as draw interval, players and start inside its limits, nothing the preset
 *                 decides — else refused; without `preset` the most recently published preset of
 *                 the game type and mode (§8 (b)), only where `mayGoWithoutPreset` allows (Admins,
 *                 load check, dev tools; an organizer must name one, 2026-11-21). The match freezes
 *                 the preset id as ruleset name.
 * Depends on:     fastify, @sbr/application (types), @sbr/contracts (types), ./matches
 *                 (requirePermission), ./matchInput (types)
 * Used by:        ./matches, ../gameRoutes
 * Spec:           docs/concepts/admin-area.md §3, §8 (b), (g), (h), §9 piece 4
 */
import type { CreateMatchInput } from '@sbr/application';
import type { Organizer, Ruleset } from '@sbr/contracts';
import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';

import type { createBody } from './matchInput.js';
import { requirePermission } from './matches.js';

interface SourcePreset {
  readonly id: string;
  readonly name: string;
  readonly gameType: Ruleset['gameType'];
  readonly mode: Ruleset['mode'];
  readonly ruleset: Ruleset;
  readonly organizer: Organizer;
}

// The presets (../../admin/presets) as match creation reads them.
export interface PresetSource {
  // The most recently published preset of a kind, or null (then the built-in ruleset).
  published(
    gameType: Ruleset['gameType'],
    mode: Ruleset['mode'],
  ): { name: string; ruleset: Ruleset } | null;
  // A published preset by id, or null.
  chosen(id: string): SourcePreset | null;
  // Every published preset.
  open(): readonly SourcePreset[];
}

type Body = z.infer<typeof createBody>;

// Whether the body stays inside what the preset allows the Organizer (§3).
function insidePreset(body: Body, p: SourcePreset): boolean {
  const o = p.organizer;
  const kind = body.startRule?.kind ?? 'host';
  const start = kind === 'host' ? o.starts.now : kind === 'at' ? o.starts.at : o.starts.whenFull;
  const decided = [body.drawIntervalMs, body.prizes, body.quietHours, body.testProfile];
  return (
    start &&
    body.gameType === p.gameType &&
    (body.mode ?? 'realtime') === p.mode &&
    body.maxPlayers >= o.players.min &&
    body.maxPlayers <= o.players.max &&
    decided.every((v) => v === undefined)
  );
}

// Who may create a match without naming a preset (owner decision of 2026-11-21): an Admin
// (`admin.view`), the load check's host (`match.loadcheck`), or a development tool in a
// development build; an organizer must name a published preset.
export function mayGoWithoutPreset(
  permissions: readonly string[],
  dev: boolean,
  devTools: boolean,
): boolean {
  return (
    permissions.includes('admin.view') ||
    permissions.includes('match.loadcheck') ||
    (dev && devTools)
  );
}

export function presetInput(
  source: PresetSource | undefined,
  body: Body,
  base: CreateMatchInput,
): CreateMatchInput | 'invalid' | 'unavailable' {
  if (body.preset === undefined) {
    if (body.speed !== undefined) return 'invalid';
    if (base.ruleset !== undefined || source === undefined) return base;
    const p = source.published(base.gameType, base.mode ?? 'realtime');
    return p === null ? base : { ...base, ruleset: p };
  }
  const p = source?.chosen(body.preset) ?? null;
  if (p === null) return 'unavailable';
  if (!insidePreset(body, p)) return 'invalid';
  return {
    ...base,
    ruleset: { name: p.id, ruleset: p.ruleset },
    drawIntervalMs: p.organizer.speedsMs[body.speed ?? 'normal'],
  };
}

export function registerStartPresetsRoute(app: FastifyInstance, source: PresetSource): void {
  app.get('/api/v1/presets', async (request, reply) => {
    if (requirePermission(request, reply, 'match.create') === null) return reply;
    return {
      presets: source.open().map((p) => ({
        id: p.id,
        name: p.name,
        gameType: p.gameType,
        mode: p.mode,
        description: p.organizer.description,
        players: p.organizer.players,
        speedsMs: p.organizer.speedsMs,
        starts: p.organizer.starts,
        countsForLeaderboard: p.ruleset.countsForLeaderboard,
      })),
    };
  });
}
