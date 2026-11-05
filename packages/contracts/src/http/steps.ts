/**
 * @file   packages/contracts/src/http/steps.ts
 * @module contracts/http
 * @brief  A member's Discord steps from the website (2026-11-04): the shape and the strict header check.
 *
 * Responsibility: `Step` is one ladder's highest step as the screens show it next to a name
 *                 (holder, farmer, investor; at most three). `parseSteps` reads the website's
 *                 X-Acting-User-Steps header: at most 2 KB of base64url, compact JSON, an array of
 *                 at most three entries with a known ladder, a name of at most 40 characters and
 *                 an icon that is a site-relative path (one leading "/", never a scheme or a
 *                 host) or null; anything else is null (no steps). The icon is loaded from the
 *                 website's own origin, never from an absolute URL.
 * Depends on:     zod
 * Used by:        ../index, apps/server/src/auth/websiteIdentity, the views that carry steps
 * Spec:           docs/spec/07-integration-architecture.md §2.3
 */
import { z } from 'zod';

export const STEP_LADDERS = ['holder', 'farmer', 'investor'] as const;

const stepSchema = z.strictObject({
  ladder: z.enum(STEP_LADDERS),
  name: z.string().min(1).max(40),
  // "/media/…": one leading slash, printable ASCII, no backslash.
  icon: z
    .string()
    .max(512)
    .regex(/^\/(?![/\\])[\x21-\x7e]*$/)
    .refine((path) => !path.includes('\\'))
    .nullable(),
});

const stepsSchema = z.array(stepSchema).max(3);

export type Step = z.infer<typeof stepSchema>;

const MAX_HEADER = 2048;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// base64url → the UTF-8 text it encodes, or null (no DOM or Node API: the server and the
// browser both read it).
function decoded(header: string): string | null {
  const text = header.replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  let bits = 0;
  let value = 0;
  let escaped = '';
  for (const c of text) {
    value = (value << 6) | ALPHABET.indexOf(c);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      escaped += `%${((value >> bits) & 0xff).toString(16).padStart(2, '0')}`;
    }
  }
  try {
    // Throws on bytes that are no UTF-8.
    return decodeURIComponent(escaped);
  } catch {
    return null;
  }
}

// The steps in the header, [] for none, null when the header is not a valid steps list.
export function parseSteps(header: string): Step[] | null {
  if (header.length > MAX_HEADER) return null;
  const text = decoded(header);
  if (text === null) return null;
  try {
    const parsed = stepsSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
