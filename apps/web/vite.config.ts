/**
 * @file   apps/web/vite.config.ts
 * @module web
 * @brief  Vite config for the player client; bound to 127.0.0.1:5390 (08 §1.1).
 *
 * Responsibility: run the React dev server on the project's reserved port, inject the
 *                 dev-badge port via `define`, keep HMR local. The build target is
 *                 modern browsers only (ES2023 lib). As the Vitest project config it
 *                 lets tests read motion.css (Vitest skips CSS by default).
 * Depends on:     vite, @vitejs/plugin-react
 * Spec:           docs/spec/08-devops-architecture.md §1.1
 */
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const PORT = 5390;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: PORT,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: PORT,
    strictPort: true,
  },
  define: {
    __SBR_DEV_PORT__: JSON.stringify(PORT),
  },
  test: {
    css: { include: [/motion\.css/] },
  },
});
