/**
 * @file   apps/server/src/http/gameRoutes.ts
 * @module server/http
 * @brief  The game's routes on the running match engine: matches, Verify, boards, the admin area.
 *
 * Responsibility: register the match routes, the open sign-ups for the website, "Verify this
 *                 match", the leaderboards and profiles, the admin area (its Overview, its
 *                 settings, History and undo, its Presets, League and Screens and texts), and in development the demo league and the time
 *                 travel, each with what it needs from the app.
 * Depends on:     fastify, ../admin/presets (types), ../admin/settings (types), ../config/*, ../db/pool (types),
 *                 ../dev/*, ../match/runtime (types), ../view/liveViews (types), ./routes/*
 * Used by:        ./app
 * Spec:           docs/spec/05-api-design.md §2; docs/concepts/admin-area.md §9
 */
import {
  LEAGUE_DEFAULTS,
  SCREEN_CATALOGUE,
  SCREEN_DEFAULTS,
  screenSettingsOf,
  ScreenSettingsSchema,
  type ScreenSettings,
} from '@sbr/contracts';
import type { FastifyInstance } from 'fastify';

import type { Presets } from '../admin/presets.js';
import type { SessionEnds } from '../auth/sessionEnds.js';
import type { SettingsStore } from '../admin/settings.js';
import type { Env } from '../config/env.js';
import type { Switches } from '../config/features.js';
import { recoveryKeyFrom } from '../config/seedKey.js';
import { technicalDefaults, type LiveTechnical } from '../config/technical.js';
import type { MaintenanceCheck } from '../config/maintenance.js';
import type { DbPool } from '../db/pool.js';
import { registerDemoLeague } from '../dev/demoLeague.js';
import type { DevClock } from '../dev/devClock.js';
import type { MatchRuntime } from '../match/runtime.js';
import type { LiveViews } from '../view/liveViews.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAdminAccounts } from './routes/adminAccounts.js';
import { registerFlatSettings, type FlatPage } from './routes/adminFlatSettings.js';
import { registerAdminLeagueRoutes } from './routes/adminLeague.js';
import { registerAdminTechnical } from './routes/adminTechnical.js';
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

// "Screens and texts" (admin-area §4, §8 (i)): a page of plain values.
const SCREENS_PAGE: FlatPage<ScreenSettings> = {
  path: '/api/v1/admin/screens',
  documentId: 'screens',
  schema: ScreenSettingsSchema,
  catalogue: SCREEN_CATALOGUE,
  defaults: SCREEN_DEFAULTS,
  current: screenSettingsOf,
  view: 'admin.view',
  edit: 'settings.edit',
};

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
  // The Technical section's values as they are now (../config/technical).
  readonly technical: LiveTechnical;
  // Ended sessions lose their sockets (Players and accounts).
  readonly sessionEnds: SessionEnds;
}

// The matches, Verify, the leaderboards and profiles; in development the time travel.
export function registerGameRoutes(fastify: FastifyInstance, deps: GameRouteDeps): void {
  const { pool, match } = deps;
  // "Screens and texts" as they are now (admin-area §4), read on every request.
  const screens = () => screenSettingsOf(deps.settings.get('screens'));
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
    screens,
  });
  // The open sign-ups the hosts marked for the website (D50; empty in standalone installs).
  registerOpenRounds(fastify, {
    pool,
    screens,
    publicUrl: deps.env.SBR_PUBLIC_URL ?? null,
    basePath: deps.env.SBR_BASE_PATH,
  });
  // "Verify this match": the seed, sealed with this key, opens once a match is over.
  registerVerifyRoute(fastify, { pool, store: match.store, seedKey: deps.seedKey });
  registerLeaderboardRoutes(fastify, { pool, screens });
  registerProfileRoutes(fastify, { pool, screens });
  registerAdminArea(fastify, deps);
  // The Organizer's presets for "Start a match" (admin-area §3).
  registerStartPresetsRoute(fastify, deps.presets);
  // Development only: ten demo accounts and three counting matches for the boards.
  if (deps.isDev) registerDemoLeague(fastify, { pool, engine: match.engine });
  if (deps.clock !== undefined) {
    const clock = deps.clock;
    registerTimeTravel(fastify, { pool, engine: match.engine, scheduler: match.scheduler, clock });
  }
}

// The admin area: its Overview, settings and History, Presets, League, Screens and texts,
// Technical, Players and accounts.
function registerAdminArea(fastify: FastifyInstance, deps: GameRouteDeps): void {
  // The admin area's Overview: open matches, abort, maintenance, the health line.
  registerAdminRoutes(fastify, {
    pool: deps.pool,
    engine: deps.match.engine,
    maintenance: deps.maintenance,
    dataDir: deps.env.SBR_DATA_DIR,
    version: deps.env.SBR_VERSION,
    startedAt: Date.now(),
    switches: deps.switches,
  });
  registerAdminSettingsRoutes(fastify, {
    pool: deps.pool,
    settings: deps.settings,
    presets: deps.presets,
    defaults: {
      features: {
        guests: deps.env.SBR_FEATURE_GUESTS,
        emailVerification: deps.env.SBR_FEATURE_EMAIL_VERIFICATION,
      },
      leaderboard: LEAGUE_DEFAULTS,
      screens: SCREEN_DEFAULTS,
      technical: technicalDefaults(deps.env),
    },
  });
  registerAdminPresetRoutes(fastify, { settings: deps.settings, presets: deps.presets });
  registerAdminLeagueRoutes(fastify, { pool: deps.pool, settings: deps.settings });
  registerFlatSettings(fastify, deps.settings, SCREENS_PAGE);
  registerAdminTechnical(fastify, {
    pool: deps.pool,
    settings: deps.settings,
    website: deps.env.SBR_AUTH_MODE === 'website',
    defaults: technicalDefaults(deps.env),
    technical: deps.technical,
    // The step-up's code: the TOTP secret's seal and the recovery codes' key (K20).
    keys: { seal: deps.seedKey, recovery: recoveryKeyFrom(deps.env) },
  });
  // Players and accounts: standalone only; the website decides accounts and roles (D41, D46).
  if (deps.env.SBR_AUTH_MODE === 'local')
    registerAdminAccounts(fastify, { pool: deps.pool, sessionEnds: deps.sessionEnds });
}
