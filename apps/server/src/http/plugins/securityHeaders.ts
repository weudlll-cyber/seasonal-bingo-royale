/**
 * @file   apps/server/src/http/plugins/securityHeaders.ts
 * @module server/http
 * @brief  Registers helmet with the project's baseline Content Security Policy.
 *
 * Responsibility: hard-set the headers of 03 §7 for every response: CSP (self scripts
 *                 and styles), frame and referrer rules, nosniff and a Permissions-Policy
 *                 that denies camera, microphone, geolocation and payment. HSTS comes from
 *                 the TLS proxy (ops/Caddyfile).
 * Depends on:     @fastify/helmet
 * Used by:        ../app.ts
 * Spec:           docs/spec/03-security-architecture.md §7, docs/spec/05-api-design.md §1
 */
import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

export async function registerSecurityHeaders(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      // "default-src 'self'" plus explicit directives for the placeholder page. The admin
      // app (apps/admin) will raise its own stricter CSP with frame-ancestors 'none' when
      // its routes are wired (WP-19).
      directives: {
        'default-src': ["'self'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'self'"],
        'form-action': ["'self'"],
        'object-src': ["'none'"],
        'img-src': ["'self'", 'data:'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'script-src': ["'self'"],
        'connect-src': ["'self'"],
      },
    },
    // HSTS is only meaningful behind TLS: the standalone Caddy sends it (ops/Caddyfile).
    strictTransportSecurity: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'sameorigin' },
  });
  // 03 §7: no camera, microphone, location or payment for the game's pages (audit S7).
  app.addHook('onSend', (_request, reply, _payload, done) => {
    reply.header('permissions-policy', PERMISSIONS_POLICY);
    done();
  });
}

const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=()';
