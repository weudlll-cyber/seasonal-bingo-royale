/**
 * @file   apps/server/build.mjs
 * @module server
 * @brief  Production build of the server: one bundle per entry point plus the SQL migrations.
 *
 * Responsibility: bundle src/main.ts (the server) and src/cli.ts (the operator commands,
 *                 e.g. create-super) with esbuild into dist/, the workspace packages
 *                 (@sbr/*, TypeScript sources) inlined and the npm dependencies left as
 *                 imports for node_modules; copy src/db/migrations to dist/migrations, where
 *                 the bundled migrator looks for them. Run by the Dockerfile.
 * Depends on:     esbuild, node:fs
 * Spec:           docs/spec/08-devops-architecture.md §4; docs/spec/09-deployment-architecture.md §1
 */
import { cpSync, rmSync } from 'node:fs';

import { build } from 'esbuild';

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

rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/main.ts', 'src/cli.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  plugins: [npmExternal],
  // Bundled CommonJS code may still call require().
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
cpSync('src/db/migrations', 'dist/migrations', { recursive: true });
