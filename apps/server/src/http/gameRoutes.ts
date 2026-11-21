/**
 * @file   apps/server/src/http/gameRoutes.ts
 * @module server/http
 * @brief  The game's routes on the running match engine: matches, Verify, boards, the admin area.
 *
 * Responsibility: register the match routes, the open sign-ups for the website, "Verify this
 *                 match", the leaderboards and profiles, the admin area (its Overview, its
 *                 settings, History and undo, and its Presets), and in development the demo league and the time
 *                 travel, each with what it needs from the app.
 * Depends on:     fastify, ../admin/presets (types), ../admin/settings (types), ../config/*, ../db/pool (types),
 *                 ../dev/*, ../match/runtime (types), ../view/liveViews (types), ./routes/*
 * Used by:        ./app
 * Spec:           docs/spec/05-api-design.md §2; docs/concepts/admin-area.md §9
 */
import type { FastifyInstance } from 'fastify';

import type { Presets } from '../admin/presets.js';
import type { SettingsStore } from '../admin/settings.js';
import type { Env } from '../config/env.js';
import type { Switches } from '../config/features.js';
import type { MaintenanceCheck } from '../config/maintenance.js';
import type { DbPool } from '../db/pool.js';
import { registerDemoLeague } from '../dev/demoLeague.js';
import type { DevClock } from '../dev/devClock.js';
import type { MatchRuntime } from '../match/runtime.js';
import type { LiveViews } from '../view/liveViews.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAdminPresetRoutes } from './routes/adminPresets.js';
import { registerAdminSettingsRoutes } from './routes/adminSettings.js';
import { registerLeaderboardRoutes } from './routes/leaderboards.js';
import { registerMatchRoutes } from './routes/matches.js';
import { registerVerifyRoute } from './routes/matchVerify.js';
import type { LiveMetrics } from './routes/metrics.js';
import { registerOpenRounds } from './routes/openRounds.js';
import { registerProfileRoutes } from './routes/profiles.js';
import { registerStartPresetsRoute } from './routes/startPresets.js';
import { registerTimeTravel } from './routes/timeTravel.js';

export interface GameRouteDeps {
  readonly env: Env;
  readonly pool: DbPool;
  readonly isDev: boolean;
  readonly maintenance: MaintenanceCheck;
  readonly seedKey: Buffer;
  readonly match: MatchRuntime;
  // Development only: the time-travel clock the match runtime runs on.
  readonly clock: DevClock | undefined;
  readonly live: LiveMetrics;
  readonly views: LiveViews;
  // The admin area's settings and the switches read from them (../admin/settings).
  readonly settings: SettingsStore;
  readonly presets: Presets;
  readonly switches: () => Switches;
}

// The matches, Verify, the leaderboards and profiles; in development the time travel.
export function registerGameRoutes(fastify: FastifyInstance, deps: GameRouteDeps): void {
  const { pool, match } = deps;
  registerMatchRoutes(fastify, {
    pool,
    engine: match.engine,
    store: match.store,
    dev: deps.isDev,
    maintenance: deps.maintenance,
    live: deps.live,
    views: deps.views,
    website: deps.env.SBR_AUTH_MODE === 'website',
    // A new match plays a published preset (§8 (b); the Organizer's choice, §3).
    presets: deps.presets,
  });
  // The open sign-ups the hosts marked for the website (D50; empty in standalone installs).
  registerOpenRounds(fastify, {
    pool,
    publicUrl: deps.env.SBR_PUBLIC_URL ?? null,
    basePath: deps.env.SBR_BASE_PATH,
  });
  // "Verify this match": the seed, sealed with this key, opens once a match is over.
  registerVerifyRoute(fastify, { pool, store: match.store, seedKey: deps.seedKey });
  registerLeaderboardRoutes(fastify, { pool });
  registerProfileRoutes(fastify, { pool });
  // The admin area's Overview: open matches, abort, maintenance, the health line.
  registerAdminRoutes(fastify, {
    pool,
    engine: match.engine,
    maintenance: deps.maintenance,
    dataDir: deps.env.SBR_DATA_DIR,
    version: deps.env.SBR_VERSION,
    startedAt: Date.now(),
    switches: deps.switches,
  });
  registerAdminSettingsRoutes(fastify, {
    pool,
    settings: deps.settings,
    presets: deps.presets,
    defaults: {
      features: {
        guests: deps.env.SBR_FEATURE_GUESTS,
        emailVerification: deps.env.SBR_FEATURE_EMAIL_VERIFICATION,
      },
    },
  });
  registerAdminPresetRoutes(fastify, { settings: deps.settings, presets: deps.presets });
  registerStartPresetsRoute(fastify, deps.presets);
  // Development only: ten demo accounts and three counting matches for the boards.
  if (deps.isDev) registerDemoLeague(fastify, { pool, engine: match.engine });
  if (deps.clock !== undefined) {
    const clock = deps.clock;
    registerTimeTravel(fastify, { pool, engine: match.engine, scheduler: match.scheduler, clock });
  }
}
