/**
 * @file   apps/server/src/http/routes/adminTechnical.ts
 * @module server/http
 * @brief  The admin area's Technical section, and the second step an owner repeats before a change.
 *
 * Responsibility: GET /api/v1/admin/technical and POST /api/v1/admin/technical { values,
 *                 comment? } as a page of plain values (./adminFlatSettings): session lengths,
 *                 the reset link's lifetime, rate limits and socket caps with hard min and max
 *                 (admin-area §8 (c)), read by the server on every use, so a change applies
 *                 without a restart. Standalone: only the owner (`technical.edit`), and a
 *                 change needs a second step (TOTP) passed within the last 10 minutes, else 403
 *                 STEP_UP_REQUIRED (§7 row 10). Website mode: the website admins
 *                 (`settings.edit`, §8 (e)), the website doing its own 2FA. POST
 *                 /api/v1/auth/2fa/step-up { code } or { recoveryCode } (standalone, a signed-in
 *                 admin with a confirmed factor): passes the second step again for this session;
 *                 400 TWO_FACTOR_FAILED, limited per session like the sign-in step. Every change
 *                 is audited; the session plugin's limit and CSRF apply.
 * Depends on:     fastify, zod, @sbr/contracts, @seasonal/kit/server (RateLimiter),
 *                 ../../admin/settings (types), ../../auth/rateLimit (liveRule),
 *                 ../../auth/twoFactor, ../../config/technical, ../../db/pool (types),
 *                 ./adminFlatSettings
 * Used by:        ../gameRoutes
 * Spec:           docs/concepts/admin-area.md §4 (Technical), §7, §8 (c), (e), (f), §9 piece 7
 */
import { TECHNICAL_CATALOGUE, technicalSettingsOf, TechnicalSettingsSchema } from '@sbr/contracts';
import { RateLimiter } from '@seasonal/kit/server';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { SettingsStore } from '../../admin/settings.js';
import { liveRule } from '../../auth/rateLimit.js';
import { verify, type TwoFactorKeys } from '../../auth/twoFactor.js';
import { liveLimits, type LiveTechnical } from '../../config/technical.js';
import type { DbPool } from '../../db/pool.js';
import { registerFlatSettings } from './adminFlatSettings.js';

export interface AdminTechnicalDeps {
  readonly pool: DbPool;
  readonly settings: SettingsStore;
  readonly website: boolean;
  readonly defaults: ReturnType<LiveTechnical>;
  readonly technical: LiveTechnical;
  // The install's secret key: the TOTP secret is sealed with it (standalone).
  // The install's keys for the step-up's code (../../auth/twoFactor).
  readonly keys: TwoFactorKeys;
}

// How long a passed second step counts for a change (admin-area §7 row 10).
export const STEP_UP_MS = 10 * 60_000;

// True when the session passed its second step recently; else the 403 answer is sent.
export function recentSecondStep(request: FastifyRequest, reply: FastifyReply): boolean {
  const at = request.session?.secondStepAt ?? null;
  if (at !== null && Date.now() - at < STEP_UP_MS) return true;
  void reply.status(403).send({ code: 'STEP_UP_REQUIRED' });
  return false;
}

const stepUpBody = z.union([
  z.object({ code: z.string().max(16) }),
  z.object({ recoveryCode: z.string().max(32) }),
]);

export function registerAdminTechnical(app: FastifyInstance, deps: AdminTechnicalDeps): void {
  const permission = deps.website ? 'settings.edit' : 'technical.edit';
  registerFlatSettings(app, deps.settings, {
    path: '/api/v1/admin/technical',
    documentId: 'technical',
    schema: TechnicalSettingsSchema,
    catalogue: TECHNICAL_CATALOGUE,
    defaults: deps.defaults,
    current: (doc) => technicalSettingsOf(doc, deps.defaults),
    view: permission,
    edit: permission,
    ...(deps.website ? {} : { beforeSave: recentSecondStep }),
  });
  if (deps.website) return;
  const tries = new RateLimiter(liveRule('twoFactor', liveLimits(deps.technical)));
  app.post('/api/v1/auth/2fa/step-up', async (request, reply) => {
    const s = request.session;
    if (s === null || s.accountId === null || s.kind !== 'admin' || s.twoFactorPending)
      return reply.status(409).send({ code: 'NO_TWO_FACTOR_STEP' });
    if (!tries.take(s.id).allowed) return reply.status(429).send({ code: 'RATE_LIMITED' });
    const parsed = stepUpBody.safeParse(request.body);
    const who = { accountId: s.accountId, sessionId: s.id };
    const ok = parsed.success && (await verify(deps.pool, deps.keys, who, parsed.data));
    if (!ok) return reply.status(400).send({ code: 'TWO_FACTOR_FAILED' });
    return reply.status(204).send();
  });
}
