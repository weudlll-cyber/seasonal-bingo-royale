/**
 * @file   apps/web/src/shell/DockedChat.tsx
 * @module web/shell
 * @brief  The website's chat docked under the game in website mode (07 §6, K18).
 *
 * Responsibility: only when the server names the website's chat (`chat` in the session answer,
 *                 website mode) and only on the lobby, a match screen (player, out player,
 *                 spectator) and the host console, the screen sits in the kit's `DockedScreen`
 *                 with the website's embed page in its dock (`WebsiteChatFrame`: sandboxed, K17;
 *                 strict-origin referrer; the game's theme): on a desktop a strip under the game,
 *                 always in sight; on a phone a bar at the bottom that opens it as a sheet. The
 *                 dock stays mounted from lobby to match to console, so the chat keeps its room
 *                 and what was typed. Standalone: no dock, no frame, no request (./dock.css).
 * Depends on:     react, @seasonal/kit/react (DockedScreen, WebsiteChatFrame), ./router (types),
 *                 ./session, ../useScrollHint, ./dock.css, ./dockSide.css
 * Used by:        ./AppShell
 * Spec:           docs/spec/07-integration-architecture.md §6; Seasonal Entertainment docs/EMBED.md
 */
import { DockedScreen, WebsiteChatFrame } from '@seasonal/kit/react';
import type { ReactElement, ReactNode } from 'react';

import type { Route } from './router.js';
import { useScrollHint } from '../useScrollHint.js';
import { useSession } from './session.js';
import './dock.css';
import './dockSide.css';

// The screens the chat is docked under.
const CHAT_ROUTES: ReadonlySet<Route['name']> = new Set(['lobby', 'match', 'host']);

export interface ChatPlace {
  readonly path: string;
  readonly room: string;
}

// Null on screens without the chat and in standalone installs.
export function useChatPlace(route: Route): ChatPlace | null {
  const chat = useSession().session?.chat ?? null;
  return chat !== null && CHAT_ROUTES.has(route.name) ? chat : null;
}

export function DockedChat({
  place,
  children,
}: {
  readonly place: ChatPlace;
  readonly children: ReactNode;
}): ReactElement {
  // The game area scrolls where its content is taller than the strip leaves (./dock.css).
  useScrollHint('.sk-docked-main');
  return (
    <DockedScreen
      chat={<WebsiteChatFrame room={place.room} path={place.path} />}
      bar="line"
      callId={null}
    >
      {children}
    </DockedScreen>
  );
}
