/**
 * @file   apps/server/src/auth/displayName.ts
 * @module server/auth
 * @brief  What a display name may be: letters, digits, `_ . -`, within the limits' lengths.
 *
 * Responsibility: one pattern for registration and the profile lookup, its lengths from the
 *                 limits the session answer sends (@sbr/contracts LIMITS), so the forms and the
 *                 server agree.
 * Depends on:     @sbr/contracts
 * Used by:        ../http/routes/auth, ../http/routes/profiles
 * Spec:           docs/spec/05-api-design.md §2.1; docs/concepts/admin-area.md §8 (m)
 */
import { LIMITS } from '@sbr/contracts';

const { min, max } = LIMITS.displayName;

export const DISPLAY_NAME = new RegExp(`^[\\p{L}\\p{N}_.-]{${String(min)},${String(max)}}$`, 'u');
