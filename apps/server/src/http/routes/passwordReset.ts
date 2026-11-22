/**
 * @file   apps/server/src/http/routes/passwordReset.ts
 * @module server/http
 * @brief  "Forgot password?": POST /auth/password-reset and /auth/password-reset/complete (D60).
 *
 * Responsibility: standalone installs with SMTP settings only (else the routes do not exist,
 *                 404). The request answers 202 whether or not the e-mail belongs to an account
 *                 (no enumeration), limited per address and per e-mail; a failing mail server is
 *                 logged, never shown. The completion takes the token from the link and a new
 *                 password: 204, every session of the account ended (sockets closed); 400
 *                 RESET_INVALID for an unknown, used or expired token; 400 PASSWORD_WEAK. Both
 *                 start no session and take JSON only (no CSRF token exists yet, 03 §8).
 * Depends on:     fastify, zod, ../../auth/passwordReset, ../../auth/mailer (types),
 *                 ../../auth/rateLimit, @seasonal/kit/server (SessionEnds, types), ../../db/pool (types)
 * Used by:        ../app
 * Spec:           docs/spec/03-security-architecture.md §1, §13; docs/spec/05-api-design.md §2.1
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Mailer } from '../../auth/mailer.js';
import { completeReset, requestReset } from '../../auth/passwordReset.js';
import { liveRule, RateLimiter } from '../../auth/rateLimit.js';
import type { SessionEnds } from '@seasonal/kit/server';
import type { DbPool } from '../../db/pool.js';
import { liveLimits, type LiveTechnical } from '../../config/technical.js';

interface PasswordResetDeps {
  readonly pool: DbPool;
  readonly mailer: Mailer | null;
  readonly sessionEnds: SessionEnds;
  // The game's public address for the link; null in development (the request's own).
  readonly publicUrl: string | null;
  readonly basePath: string;
  // The Technical section: the link's lifetime and the request limits, read on every use.
  readonly technical: LiveTechnical;
}

const requestBody = z.object({ email: z.email().max(254) });
const completeBody = z.object({
  token: z.string().min(20).max(128),
  password: z.string().max(128),
});
const config = { sessionStarter: true };

export function registerPasswordReset(app: FastifyInstance, deps: PasswordResetDeps): void {
  const mailer = deps.mailer;
  if (mailer === null) return;
  const live = liveLimits(deps.technical);
  const byIp = new RateLimiter(liveRule('resetIp', live));
  const byAccount = new RateLimiter(liveRule('resetAccount', live));
  app.post('/api/v1/auth/password-reset', { config }, async (request, reply) => {
    const parsed = requestBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const email = parsed.data.email.toLowerCase();
    if (!byIp.take(request.ip).allowed || !byAccount.take(email).allowed) {
      return reply.status(429).send({ code: 'RATE_LIMITED' });
    }
    const pageUrl = deps.publicUrl ?? `${request.protocol}://${request.host}${deps.basePath}`;
    const validMinutes = deps.technical().resetLinkMinutes;
    await requestReset({ pool: deps.pool, mailer, pageUrl, validMinutes }, email).catch(
      (error: unknown) => {
        request.log.warn({ err: error }, 'password reset mail failed');
      },
    );
    return reply.status(202).send({ sent: true });
  });
  app.post('/api/v1/auth/password-reset/complete', { config }, async (request, reply) => {
    const parsed = completeBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ code: 'RESET_INVALID' });
    const result = await completeReset(deps.pool, parsed.data.token, parsed.data.password);
    if (!result.ok)
      return reply
        .status(400)
        .send(
          result.code === 'PASSWORD_WEAK'
            ? { code: result.code, reason: result.reason }
            : { code: result.code },
        );
    await deps.sessionEnds.end(result.sessions);
    return reply.status(204).send();
  });
}
