/**
 * @file   apps/server/src/config/features.ts
 * @module server/config
 * @brief  Feature flags of the first draft (03 §2.1, §2.3).
 *
 * Responsibility: the flags the server reads at start: e-mail verification off by default
 *                 (with it on, unverified accounts cannot sign in and league points need
 *                 confirmed addresses, D59), guests on, and whether "Forgot password?" exists
 *                 (standalone with SMTP settings, D60). Admin two-factor sign-in has no flag
 *                 (always in standalone installs, D60). Read from the environment until the
 *                 `features` settings document is editable (WP-20).
 * Depends on:     ./env
 * Used by:        ../http/app, ../http/routes/auth
 * Spec:           docs/spec/03-security-architecture.md §2.1, §2.3; docs/spec/11-admin-panel.md §3.10
 */
import type { Env } from './env.js';

export interface Features {
  readonly emailVerification: boolean;
  readonly guests: boolean;
  // Standalone installs with SMTP settings: "Forgot password?" (D60).
  readonly passwordReset: boolean;
}

export function featuresFrom(env: Env): Features {
  return {
    emailVerification: env.SBR_FEATURE_EMAIL_VERIFICATION,
    guests: env.SBR_FEATURE_GUESTS,
    passwordReset: env.SBR_AUTH_MODE === 'local' && env.SBR_SMTP_HOST !== undefined,
  };
}
