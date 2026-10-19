/**
 * @file   apps/server/src/http/routes/placeholder.ts
 * @module server/http
 * @brief  Placeholder lobby HTML page served while the real client bundles are empty.
 *
 * Responsibility: answer GET / with a minimal page the owner can open in the browser
 *                 after `pnpm dev`. In development the dev badge "Bingo · dev · <port>"
 *                 is embedded (08 §1.1); in production the badge is left out.
 * Depends on:     fastify
 * Used by:        ../app.ts
 * Spec:           docs/spec/08-devops-architecture.md §1.1, docs/spec/15-implementation-plan.md WP-03
 */
import type { FastifyInstance } from 'fastify';

export interface PlaceholderOptions {
  readonly dev: boolean;
  readonly port: number;
}

export function registerPlaceholder(app: FastifyInstance, options: PlaceholderOptions): void {
  const html = renderPage(options);
  app.get('/', async (_request, reply) => {
    return reply.header('content-type', 'text/html; charset=utf-8').send(html);
  });
}

function renderPage(options: PlaceholderOptions): string {
  const badge = options.dev ? renderBadge(options.port) : '';
  // Styles stay inline so the CSP's style-src can keep 'unsafe-inline' without a
  // separate stylesheet route. Content is intentionally minimal: real UI arrives in WP-08.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Seasonal Bingo Royale</title>
  <style>
    html, body { margin: 0; background: #0f1115; color: #e7ecf3; font-family: system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; place-items: center; padding: 2rem; }
    .card { max-width: 32rem; text-align: center; }
    h1 { margin: 0 0 .5rem; font-weight: 600; letter-spacing: .02em; }
    p { margin: .25rem 0; color: #9aa5b2; }
    .badge { position: fixed; left: .75rem; bottom: .75rem; padding: .25rem .5rem;
             font-size: .75rem; background: #04aaf7; color: #0f1115; border-radius: .25rem; }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <h1>Seasonal Bingo Royale</h1>
      <p>Server is up. The player client (WP-08) is not wired in yet.</p>
      <p><a style="color:#04aaf7" href="/healthz">/healthz</a> &middot;
         <a style="color:#04aaf7" href="/readyz">/readyz</a> &middot;
         <a style="color:#04aaf7" href="/metrics">/metrics</a></p>
    </section>
  </main>
  ${badge}
</body>
</html>`;
}

function renderBadge(port: number): string {
  return `<div class="badge" aria-label="Development build badge">Bingo &middot; dev &middot; ${String(port)}</div>`;
}
