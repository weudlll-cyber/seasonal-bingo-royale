/**
 * @file   apps/server/src/config/technical.ts
 * @module server/config
 * @brief  The Technical settings as the server reads them at runtime (admin-area §9 piece 7).
 *
 * Responsibility: `liveTechnical` — the `technical` settings document over today's defaults,
 *                 with the environment's socket caps as their first default (§8 (p)), read on
 *                 every use so a change applies without a restart; from it the session lengths
 *                 (`sessionLengthsOf`; website mode keeps its 7 days for members and guests,
 *                 owner 2026-11-04/09) and the application rate limits (`liveLimits`, the
 *                 windows unchanged, ../auth/rateLimit liveRule).
 * Depends on:     @sbr/contracts, ../admin/settings (types), ../auth/rateLimit (types),
 *                 ../auth/sessions (types), ./env (types)
 * Used by:        ../http/app, ../http/signIn, ../http/gameRoutes, ../auth/sessionPlugin,
 *                 ../http/routes/*
 * Spec:           docs/concepts/admin-area.md §4 (Technical), §8 (c), (p), §9 piece 7
 */
import { TECHNICAL_DEFAULTS, technicalSettingsOf, type TechnicalSettings } from '@sbr/contracts';

import type { SettingsStore } from '../admin/settings.js';
import type { LiveLimits } from '../auth/rateLimit.js';
import type { SessionLengths } from '../auth/sessions.js';
import type { Env } from './env.js';

export type LiveTechnical = () => TechnicalSettings;

// Today's values, the socket caps from the environment.
export const technicalDefaults = (env: Env): TechnicalSettings => ({
  ...TECHNICAL_DEFAULTS,
  socketsPerAddress: env.SBR_SOCKETS_PER_ADDRESS,
  socketsPerSession: env.SBR_SOCKETS_PER_SESSION,
});

export function liveTechnical(env: Env, settings: SettingsStore): LiveTechnical {
  const defaults = technicalDefaults(env);
  return () => technicalSettingsOf(settings.get('technical'), defaults);
}

// `playerDays`: website mode's fixed absolute lifetime of members and guests.
export const sessionLengthsOf = (t: TechnicalSettings, playerDays?: number): SessionLengths => ({
  playerIdleDays: t.playerIdleDays,
  playerAbsoluteDays: playerDays ?? t.playerAbsoluteDays,
  adminIdleMinutes: t.adminIdleMinutes,
  adminAbsoluteHours: t.adminAbsoluteHours,
});

export const liveLimits =
  (technical: LiveTechnical): LiveLimits =>
  () => {
    const t = technical();
    return {
      loginAccountIp: t.loginAccountIp,
      loginIp: t.loginIp,
      register: t.register,
      api: t.api,
      guest: t.guest,
      resetIp: t.resetIp,
      resetAccount: t.resetAccount,
      twoFactor: t.twoFactor,
    };
  };
