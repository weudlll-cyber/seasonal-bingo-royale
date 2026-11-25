/**
 * @file   apps/server/src/http/plugins/securityHeaders.ts
 * @module server/http
 * @brief  Registers helmet with the kit's security headers as data (03 §7).
 *
 * Responsibility: hard-set the headers of 03 §7 for every response: the policy and the extra
 *                 headers are the kit's `securityHeaderSet` (self scripts, styles and fonts, no
 *                 <base>, framed by this site only, no referrer, nosniff, a Permissions-Policy
 *                 that denies camera, microphone, location and payment, same-origin opener and
 *                 resource policies), with blob images and, for the development placeholder page
 *                 only, inline styles. helmet writes the policy and keeps its own further headers.
 *                 No HSTS from the game: the TLS proxy sends it (ops/Caddyfile; the website's
 *                 proxy in a website install).
 * Depends on:     @fastify/helmet, @seasonal/kit/server (securityHeaderSet)
 * Used by:        ../app.ts
 * Spec:           docs/spec/03-security-architecture.md §7, docs/spec/05-api-design.md §1
 */
import helmet from '@fastify/helmet';
import { securityHeaderSet } from '@seasonal/kit/server';
import type { FastifyInstance } from 'fastify';

// `devPage`: the development placeholder page (./routes/placeholder) styles itself inline.
export async function registerSecurityHeaders(
  app: FastifyInstance,
  { devPage, mode }: { readonly devPage: boolean; readonly mode: 'website' | 'standalone' },
): Promise<void> {
  const set = securityHeaderSet({ mode, inlineStyles: devPage, blobImages: true });
  await app.register(helmet, {
    // frame-ancestors stays 'self' until the embed allowlist exists (07 §3.4); a website install
    // is on the website's own origin. The admin app (apps/admin) will raise its own stricter CSP
    // (the kit's `admin` set) when its routes are wired (WP-19).
    contentSecurityPolicy: {
      directives: Object.fromEntries(
        Object.entries(set.directives).map(([name, sources]) => [name, [...sources]]),
      ),
    },
    // HSTS is only meaningful behind TLS: the standalone Caddy sends it (ops/Caddyfile).
    strictTransportSecurity: false,
    xFrameOptions: { action: 'sameorigin' },
  });
  // The kit's further headers, over helmet's own of the same names (audit S7).
  app.addHook('onSend', (_request, reply, _payload, done) => {
    for (const [name, value] of Object.entries(set.headers)) reply.header(name, value);
    done();
  });
}
