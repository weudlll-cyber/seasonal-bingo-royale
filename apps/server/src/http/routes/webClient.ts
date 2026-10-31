/**
 * @file   apps/server/src/http/routes/webClient.ts
 * @module server/http
 * @brief  Serves the built player client and the admin placeholder (one image, 09 §1).
 *
 * Responsibility: GET / answers the client's index.html; any other GET outside /api,
 *                 /ws and the health and metrics routes answers the file of that name from
 *                 SBR_WEB_DIR (assets with a content hash are cached for a year, the rest
 *                 revalidated); a path that leaves the directory or names no file is a 404.
 *                 The client routes with the URL hash, so no other path needs index.html.
 *                 /admin answers a placeholder until the admin app exists (WP-19).
 * Depends on:     fastify
 * Used by:        ../app.ts (only when SBR_WEB_DIR is set, i.e. in the image)
 * Spec:           docs/spec/09-deployment-architecture.md §1; docs/spec/08-devops-architecture.md §4
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance, FastifyReply } from 'fastify';

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const ADMIN_PLACEHOLDER = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Seasonal Bingo Royale — admin</title></head>
<body style="font-family: system-ui, sans-serif; margin: 3rem;">
<h1>Admin</h1><p>The admin app is not part of this version yet. Hosts run their matches from the game itself.</p>
</body></html>`;

export function registerWebClient(app: FastifyInstance, webDir: string): void {
  const root = path.resolve(webDir);
  app.get('/admin', (_request, reply) =>
    reply.header('content-type', 'text/html; charset=utf-8').send(ADMIN_PLACEHOLDER),
  );
  app.get('/', (_request, reply) => sendFile(reply, root, 'index.html'));
  // The router has decoded the path already (a broken %-escape is its 400); decoding it a
  // second time turned "%25zz" into a 500 (audit S10).
  app.get('/*', (request, reply) =>
    sendFile(reply, root, (request.params as { '*': string })['*']),
  );
}

async function sendFile(reply: FastifyReply, root: string, name: string): Promise<FastifyReply> {
  const file = path.resolve(root, name);
  // Nothing outside the client directory, and only plain files.
  if (!file.startsWith(root + path.sep)) return reply.status(404).send({ code: 'NOT_FOUND' });
  const info = await stat(file).catch(() => null);
  if (info === null || !info.isFile()) return reply.status(404).send({ code: 'NOT_FOUND' });
  const hashed = name.startsWith('assets/');
  return reply
    .header('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream')
    .header('cache-control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
    .send(await readFile(file));
}
