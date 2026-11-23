/**
 * @file   apps/server/src/http/routes/twoFactor.ts
 * @module server/http
 * @brief  The second sign-in step of local admin accounts: enrol, confirm, verify (TOTP, D60).
 *
 * Responsibility: local mode only (the website does its own 2FA). A session waiting for its
 *                 second step (../../auth/sessions twoFactorPending) may: POST /auth/2fa/enrol —
 *                 a new secret with its QR code (SVG) and link while no factor is confirmed;
 *                 POST /auth/2fa/confirm { code } — the factor goes live, the answer holds ten
 *                 recovery codes shown once; POST /auth/2fa/verify { code } or { recoveryCode }.
 *                 Wrong answers 400 TWO_FACTOR_FAILED; codes limited per session (429). Any
 *                 other session gets 409 NO_TWO_FACTOR_STEP. CSRF applies (the session exists).
 * Depends on:     fastify, zod, ../../auth/twoFactor, ../../auth/rateLimit, ../../db/pool (types)
 * Used by:        ../app
 * Spec:           docs/spec/03-security-architecture.md §1, §13; docs/spec/05-api-design.md §2.1
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { liveRule, RateLimiter } from '../../auth/rateLimit.js';
import { confirm, enrol, twoFactorStep, verify, type TwoFactorKeys } from '../../auth/twoFactor.js';
import type { DbPool } from '../../db/pool.js';
import { liveLimits, type LiveTechnical } from '../../config/technical.js';

interface TwoFactorDeps {
  readonly pool: DbPool;
  // The install's keys: the seed key seals the TOTP secret, the recovery key keys the codes.
  readonly keys: TwoFactorKeys;
  // The Technical section's limit of codes per session, read on every try.
  readonly technical?: LiveTechnical;
}

const codeBody = z.object({ code: z.string().max(16) });
const verifyBody = z.union([
  z.object({ code: z.string().max(16) }),
  z.object({ recoveryCode: z.string().max(32) }),
]);

// The waiting session's account and session ids, else the 409 answer is sent.
function pending(request: FastifyRequest, reply: FastifyReply) {
  const s = request.session;
  if (s === null || s.accountId === null || !s.twoFactorPending) {
    void reply.status(409).send({ code: 'NO_TWO_FACTOR_STEP' });
    return null;
  }
  return { accountId: s.accountId, sessionId: s.id, name: s.displayName ?? 'admin' };
}

export function registerTwoFactor(app: FastifyInstance, deps: TwoFactorDeps): void {
  const live = deps.technical === undefined ? undefined : liveLimits(deps.technical);
  const tries = new RateLimiter(liveRule('twoFactor', live));
  const limited = (sessionId: string) => !tries.take(sessionId).allowed;
  app.post('/api/v1/auth/2fa/enrol', async (request, reply) => {
    const who = pending(request, reply);
    if (who === null) return reply;
    if ((await twoFactorStep(deps.pool, who.accountId)) !== 'enrol') {
      return reply.status(409).send({ code: 'NO_TWO_FACTOR_STEP' });
    }
    return enrol(deps.pool, deps.keys.seal, who.accountId, who.name);
  });
  app.post('/api/v1/auth/2fa/confirm', async (request, reply) => {
    const who = pending(request, reply);
    if (who === null) return reply;
    if (limited(who.sessionId)) return reply.status(429).send({ code: 'RATE_LIMITED' });
    const parsed = codeBody.safeParse(request.body);
    const codes = parsed.success
      ? await confirm(deps.pool, deps.keys, who, parsed.data.code)
      : null;
    if (codes === null) return reply.status(400).send({ code: 'TWO_FACTOR_FAILED' });
    return { recoveryCodes: codes };
  });
  app.post('/api/v1/auth/2fa/verify', async (request, reply) => {
    const who = pending(request, reply);
    if (who === null) return reply;
    if (limited(who.sessionId)) return reply.status(429).send({ code: 'RATE_LIMITED' });
    const parsed = verifyBody.safeParse(request.body);
    const ok = parsed.success && (await verify(deps.pool, deps.keys, who, parsed.data));
    if (!ok) return reply.status(400).send({ code: 'TWO_FACTOR_FAILED' });
    return reply.status(204).send();
  });
}
