/**
 * @file   apps/web/vite.config.ts
 * @module web
 * @brief  Vite config for the player client; bound to 127.0.0.1:5390 (08 §1.1).
 *
 * Responsibility: run the React dev server on the project's reserved port, proxy /api
 *                 and /ws to the server on 3900, inject the dev-badge port via `define`,
 *                 keep HMR local. The build target is
 *                 modern browsers only (ES2023 lib). As the Vitest project config it
 *                 lets tests read motion.css and the design tokens (Vitest skips CSS by
 *                 default).
 * Depends on:     vite, @vitejs/plugin-react
 * Spec:           docs/spec/08-devops-architecture.md §1.1
 */
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const PORT = 5390;
const SERVER = 'http://127.0.0.1:3900';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: PORT,
    strictPort: true,
    // The real game talks to the server through the client origin, so the session cookie
    // is first-party and the WebSocket Origin check sees this port (03 §3, 06 §2).
    proxy: {
      '/api': { target: SERVER, changeOrigin: false },
      '/ws': { target: SERVER, ws: true, changeOrigin: false },
    },
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
    // Tests read these as raw text (reduced motion, token contrast); other CSS is skipped.
    css: { include: [/motion\.css/, /tokens\.css/] },
  },
});
