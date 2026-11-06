/**
 * @file   apps/server/src/auth/mailer.ts
 * @module server/auth
 * @brief  Outgoing e-mail through the operator's SMTP settings (standalone installs, D60).
 *
 * Responsibility: one plain-text message to one address, through SBR_SMTP_HOST/PORT/USER/
 *                 PASSWORD (./smtp: port 465 implicit TLS, else STARTTLS when the server offers
 *                 it), from SBR_SMTP_FROM. No mailer in website mode (the website owns the
 *                 accounts) or without a host: the features that need mail are off then.
 * Depends on:     ./smtp, ../config/env (types)
 * Used by:        ../http/app, ./passwordReset
 * Spec:           docs/spec/03-security-architecture.md §1
 */
import type { Env } from '../config/env.js';
import { sendSmtp } from './smtp.js';

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

export function mailerFrom(env: Env): Mailer | null {
  const host = env.SBR_SMTP_HOST;
  if (env.SBR_AUTH_MODE !== 'local' || host === undefined) return null;
  return {
    send: (to, subject, text) =>
      sendSmtp({
        host,
        port: env.SBR_SMTP_PORT,
        user: env.SBR_SMTP_USER,
        password: env.SBR_SMTP_PASSWORD,
        from: env.SBR_SMTP_FROM,
        to,
        subject,
        text,
      }),
  };
}
