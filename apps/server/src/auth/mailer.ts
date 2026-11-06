/**
 * @file   apps/server/src/auth/mailer.ts
 * @module server/auth
 * @brief  Outgoing e-mail through the operator's SMTP settings (standalone installs, D60).
 *
 * Responsibility: one plain-text message to one address, through SBR_SMTP_HOST/PORT/USER/
 *                 PASSWORD with nodemailer (port 465 implicit TLS, else STARTTLS when the server
 *                 offers it; with a user the login needs TLS, so a password never goes in
 *                 clear), from SBR_SMTP_FROM. No mailer in website mode (the website owns the
 *                 accounts) or without a host: the features that need mail are off then.
 * Depends on:     nodemailer, ../config/env (types)
 * Used by:        ../http/app, ../http/signIn, ./passwordReset
 * Spec:           docs/spec/03-security-architecture.md §1
 */
import nodemailer from 'nodemailer';

import type { Env } from '../config/env.js';

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

export function mailerFrom(env: Env): Mailer | null {
  const host = env.SBR_SMTP_HOST;
  if (env.SBR_AUTH_MODE !== 'local' || host === undefined) return null;
  const user = env.SBR_SMTP_USER;
  const transport = nodemailer.createTransport({
    host,
    port: env.SBR_SMTP_PORT,
    secure: env.SBR_SMTP_PORT === 465,
    ...(user === undefined
      ? {}
      : { requireTLS: true, auth: { user, pass: env.SBR_SMTP_PASSWORD ?? '' } }),
  });
  return {
    send: async (to, subject, text) => {
      await transport.sendMail({ from: env.SBR_SMTP_FROM, to, subject, text });
    },
  };
}
