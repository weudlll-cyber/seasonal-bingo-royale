/**
 * @file   apps/server/src/config/features.ts
 * @module server/config
 * @brief  Feature flags of the first draft (03 §2.1, §2.3).
 *
 * Responsibility: the flags the server reads: e-mail verification off by default
 *                 (with it on, unverified accounts cannot sign in and league points need
 *                 confirmed addresses, D59), guests on, and whether "Forgot password?" exists
 *                 (standalone with SMTP settings, D60). Admin two-factor sign-in has no flag
 *                 (always in standalone installs, D60). Guests and e-mail verification are
 *                 switches an admin changes in the admin area (the `features` settings
 *                 document, ../admin/settings); the environment gives their first defaults.
 * Depends on:     zod, ./env
 * Used by:        ../http/app, ../http/signIn, ../http/routes/auth
 * Spec:           docs/spec/03-security-architecture.md §2.1, §2.3; docs/spec/11-admin-panel.md §3.10
 */
import { z } from 'zod';

import type { Env } from './env.js';

export interface Features {
  readonly emailVerification: boolean;
  readonly guests: boolean;
  // Standalone installs with SMTP settings: "Forgot password?" (D60).
  readonly passwordReset: boolean;
}

// The switches an admin may change in the admin area (the `features` settings document).
const SwitchesSchema = z.object({
  guests: z.boolean().optional(),
  emailVerification: z.boolean().optional(),
});

export type Switches = Pick<Features, 'guests' | 'emailVerification'>;

// The switches as they are now: the `features` document's values over the environment's,
// which are only the first defaults (admin-area §8 (p)). Read on every use, so a change in
// the admin area applies at once.
export function liveSwitches(
  env: Env,
  settings: { get(documentId: string): unknown },
): () => Switches {
  return () => {
    const parsed = SwitchesSchema.safeParse(settings.get('features'));
    const doc = parsed.success ? parsed.data : {};
    return {
      emailVerification: doc.emailVerification ?? env.SBR_FEATURE_EMAIL_VERIFICATION,
      guests: doc.guests ?? env.SBR_FEATURE_GUESTS,
    };
  };
}
