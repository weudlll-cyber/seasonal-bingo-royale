/**
 * @file   apps/server/build.mjs
 * @module server
 * @brief  Production build of the server: one bundle per entry point plus the SQL migrations.
 *
 * Responsibility: bundle src/main.ts and src/cli.ts with esbuild into dist/ (or the first
 *                 argument): @sbr/* sources and @seasonal/kit (a git tag the image's `pnpm deploy
 *                 --prod` cannot fetch, so a dev dependency) inlined, npm dependencies left as
 *                 imports, minified; development modules (src/dev/*) replaced by ./devStub.mjs
 *                 (kit's devStubPlugin) unless SBR_BUILD_DEV=1 (local load check only, 12 §5);
 *                 copy src/db/migrations to <out>/migrations for the bundled migrator; bundle the
 *                 `sbr loadcheck` generator (../../load/loadcheck.mjs) with its npm packages into
 *                 <out>/loadcheck.js so the production image can run it. Run by the Dockerfile.
 * Depends on:     esbuild, @seasonal/kit/devtools (devStubPlugin), ./devStub.mjs
 * Used by:        Dockerfile
 * Spec:           docs/spec/08-devops-architecture.md §4; docs/spec/09-deployment-architecture.md §1
 */
import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';

import { devStubPlugin } from '@seasonal/kit/devtools';
import { build } from 'esbuild';

const out = process.argv[2] ?? 'dist';

// npm packages stay imports for node_modules; the workspace packages (@sbr/*, TypeScript
// sources) and the kit (@seasonal/kit) are compiled into the bundle.
const INLINED = /^@(sbr|seasonal)\//;
const npmExternal = {
  name: 'npm-external',
  setup(builder) {
    builder.onResolve({ filter: /^[^./]/ }, (args) =>
      INLINED.test(args.path) ? undefined : { path: args.path, external: true },
    );
  },
};

// Development code stays out of the production bundle (audit B): the app registers these
// modules only with SBR_DEV=1, so the stub is never called in a production install.
const DEV_MODULE =
  /[\\/]src[\\/](dev[\\/][^\\/]+|http[\\/]routes[\\/](quicktest|devSignIn|timeTravel))\.js$/;
// The kit's plugin (@seasonal/kit/devtools): each dev module resolves to ./devStub.mjs.
const devStub = devStubPlugin({ devModule: DEV_MODULE, stub: path.resolve('devStub.mjs') });

rmSync(out, { recursive: true, force: true });
await build({
  entryPoints: ['src/main.ts', 'src/cli.ts'],
  outdir: out,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // Drops comments and spacing; the source map still points at the sources.
  minifyWhitespace: true,
  // SBR_BUILD_DEV=1 (docker build --build-arg, the local load check only) keeps the
  // development modules, so the same bundle can run with SBR_DEV=1 on localhost.
  plugins: process.env.SBR_BUILD_DEV === '1' ? [npmExternal] : [npmExternal, devStub],
  // Bundled CommonJS code may still call require().
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
cpSync('src/db/migrations', path.join(out, 'migrations'), { recursive: true });

// The load generator (12 §5) with socket.io-client inside: the server's node_modules do not
// hold it. ws's optional native helpers stay out (it works without them).
await build({
  entryPoints: { loadcheck: '../../load/loadcheck.mjs' },
  outdir: out,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minifyWhitespace: true,
  external: ['bufferutil', 'utf-8-validate'],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
