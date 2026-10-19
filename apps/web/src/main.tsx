/**
 * @file   apps/web/src/main.tsx
 * @module web
 * @brief  React entry point: mounts <App /> onto #root.
 *
 * Responsibility: start the player client's React tree. All real logic lives in App.tsx
 *                 and the components it imports.
 * Depends on:     react, react-dom, ./App
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';

const rootElement = document.getElementById('root');
if (rootElement === null) throw new Error('missing #root element');
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
