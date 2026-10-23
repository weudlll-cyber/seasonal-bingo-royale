/**
 * @file   apps/web/src/main.tsx
 * @module web
 * @brief  Entry point of the player client: design system, session, app shell.
 *
 * Responsibility: load the shared design system (fonts, tokens, base styles, key-moment
 *                 motion from @sbr/ui) and the Quick Test's motion styles, then render the
 *                 app shell inside the session provider. Development-only parts (quick
 *                 sign-in, Quick Test, bots) follow Vite's DEV flag, so production builds
 *                 leave them out.
 * Depends on:     react-dom, @sbr/ui (CSS), ./shell/*, ./motion.css
 * Spec:           docs/spec/01-game-design.md §13; docs/spec/15-implementation-plan.md WP-12
 */
import '@sbr/ui/fonts.css';
import '@sbr/ui/tokens.css';
import '@sbr/ui/base.css';
import '@sbr/ui/motion.css';
import './motion.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppShell } from './shell/AppShell.js';
import { SessionProvider } from './shell/session.js';

const rootElement = document.getElementById('root');
if (rootElement === null) throw new Error('missing #root element');
createRoot(rootElement).render(
  <StrictMode>
    <SessionProvider>
      <AppShell dev={import.meta.env.DEV} />
    </SessionProvider>
  </StrictMode>,
);
