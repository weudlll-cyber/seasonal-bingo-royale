/**
 * @file   apps/web/src/main.tsx
 * @module web
 * @brief  Entry point of the player client: design system, session, app shell.
 *
 * Responsibility: load the design system (the shared fonts, tokens and motion of
 *                 @seasonal/kit, then the game's own tokens, the kit's shell controls and
 *                 header, the game's base styles and key-moment motion
 *                 from @sbr/ui) and the Quick Test's motion styles, then render the app shell
 *                 inside the session provider. Development-only parts (quick sign-in, Quick
 *                 Test, bots) follow Vite's DEV flag, so production builds leave them out.
 * Depends on:     react-dom, @seasonal/kit (CSS), @sbr/ui (CSS), ./shell/*, ./motion.css
 * Spec:           docs/spec/01-game-design.md §13; docs/spec/15-implementation-plan.md WP-12
 */
// The kit's shared fonts, tokens and motion first; the game's own files after them win.
import '@seasonal/kit/fonts.css';
import '@seasonal/kit/tokens.css';
import '@sbr/ui/tokens.css';
// Before base.css: the game's own focus ring (base.css) stays on the kit's controls too. The
// kit's header (./shell/Header) with its rules; Bingo's look on it is ./shell/header.css.
import '@seasonal/kit/shell.css';
import '@seasonal/kit/header.css';
import '@sbr/ui/base.css';
import '@seasonal/kit/motion.css';
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
