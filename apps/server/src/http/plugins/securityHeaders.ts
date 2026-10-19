/**
 * @file   apps/server/src/http/plugins/securityHeaders.ts
 * @module server/http
 * @brief  Registers helmet with the project's baseline Content Security Policy.
 *
 * Responsibility: hard-set the headers of 03 §13 for every HTML and JSON response. CSP
 *                 covers the placeholder lobby page (self scripts and styles only); later
 *                 work packages tighten it as the client bundles land.
 * Depends on:     @fastify/helmet
 * Used by:        ../app.ts
 * Spec:           docs/spec/03-security-architecture.md §13, docs/spec/05-api-design.md §1
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
    // HSTS is only meaningful behind TLS; the install script turns it on with Caddy.
    strictTransportSecurity: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'sameorigin' },
  });
}
