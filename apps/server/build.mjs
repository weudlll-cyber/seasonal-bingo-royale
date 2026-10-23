/**
 * @file   apps/server/build.mjs
 * @module server
 * @brief  Production build of the server: one bundle per entry point plus the SQL migrations.
 *
 * Responsibility: bundle src/main.ts (the server) and src/cli.ts (the operator commands,
 *                 e.g. create-super) with esbuild into dist/ (or the folder given as the
 *                 first argument), the workspace packages (@sbr/*, TypeScript sources)
 *                 inlined and the npm dependencies left as imports for node_modules,
 *                 without comments or spacing; the
 *                 development modules (src/dev/*, the Quick Test and dev sign-in routes)
 *                 replaced by ./devStub.mjs; copy src/db/migrations to <out>/migrations,
 *                 where the bundled migrator looks for them. Run by the Dockerfile.
 * Depends on:     esbuild, node:fs, node:path, ./devStub.mjs
 * Used by:        Dockerfile, test/productionBundle.test.ts
 * Spec:           docs/spec/08-devops-architecture.md §4; docs/spec/09-deployment-architecture.md §1
 */
import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';

import { build } from 'esbuild';

const out = process.argv[2] ?? 'dist';

// npm packages stay imports for node_modules; the workspace packages (@sbr/*, TypeScript
// sources) are compiled into the bundle.
const npmExternal = {
  name: 'npm-external',
  setup(builder) {
    builder.onResolve({ filter: /^[^./]/ }, (args) =>
      args.path.startsWith('@sbr/') ? undefined : { path: args.path, external: true },
    );
  },
};

// Development code stays out of the production bundle (audit B): the app registers these
// modules only with SBR_DEV=1, so the stub is never called in a production install.
const DEV_MODULE = /[\\/]src[\\/](dev[\\/][^\\/]+|http[\\/]routes[\\/](quicktest|devSignIn))\.js$/;
const devStub = {
  name: 'dev-stub',
  setup(builder) {
    builder.onResolve({ filter: /^\./ }, (args) =>
      DEV_MODULE.test(path.resolve(args.resolveDir, args.path))
        ? { path: path.resolve('devStub.mjs') }
        : undefined,
    );
  },
};

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
  plugins: [npmExternal, devStub],
  // Bundled CommonJS code may still call require().
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
cpSync('src/db/migrations', path.join(out, 'migrations'), { recursive: true });
