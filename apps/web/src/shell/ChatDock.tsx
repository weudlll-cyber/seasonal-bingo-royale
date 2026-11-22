/**
 * @file   apps/web/src/shell/ChatDock.tsx
 * @module web/shell
 * @brief  The website's chat beside the game in website mode (07 §6): a Chat button and its panel.
 *
 * Responsibility: only when the server names the website's chat (`chat` in the session answer,
 *                 website mode) and only on the lobby, a match screen (player, out player,
 *                 spectator) and the host console: "Chat" in the top bar opens the panel, a side
 *                 panel on wide screens and a drawer on phones that one tap closes (its Close
 *                 button or the dimmed page behind it). Whether it is open is remembered per
 *                 browser (localStorage, every access in try/catch). The frame of the website's
 *                 embed page (`<path>?room=<room>&theme=<light|dark>` on the site's origin) is
 *                 the kit's WebsiteChatFrame (sandboxed, K17; strict-origin referrer; it follows
 *                 the game's theme, <html data-theme>); it is created the first time the panel
 *                 opens and kept while it is closed. Standalone: no button, no frame, no request.
 * Depends on:     react, @seasonal/kit/react (WebsiteChatFrame), ./router (types), ./session,
 *                 ./chat.css
 * Used by:        ./AppShell
 * Spec:           docs/spec/07-integration-architecture.md §6; Seasonal Entertainment docs/EMBED.md
 */
import { WebsiteChatFrame } from '@seasonal/kit/react';
import { useEffect, useState, type ReactElement } from 'react';

import type { Route } from './router.js';
import { useSession } from './session.js';
import './chat.css';

const OPEN_KEY = 'sbr.chat.open';
// The screens the chat stands beside.
const CHAT_ROUTES: ReadonlySet<Route['name']> = new Set(['lobby', 'match', 'host']);

function storedOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === 'true';
  } catch {
    return false;
  }
}

function storeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, String(open));
  } catch {
    // Blocked storage: the panel keeps its state for this visit only.
  }
}

// The top bar's height, for the side panel below it (shell.css keeps the bar sticky there).
function useBarHeight(active: boolean): void {
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.shell-bar');
    if (!active || bar === null) return;
    const set = (): void => {
      document.documentElement.style.setProperty(
        '--shell-bar-height',
        `${String(bar.offsetHeight)}px`,
      );
    };
    set();
    const observer = new ResizeObserver(set);
    observer.observe(bar);
    return () => {
      observer.disconnect();
    };
  }, [active]);
}

export interface ChatDock {
  readonly chat: { readonly path: string; readonly room: string };
  readonly open: boolean;
  // The frame exists from the first opening on.
  readonly opened: boolean;
  readonly setOpen: (open: boolean) => void;
}

// Null on screens without the chat and in standalone installs.
export function useChatDock(route: Route): ChatDock | null {
  const chat = useSession().session?.chat ?? null;
  const [open, setOpenState] = useState(storedOpen);
  const [opened, setOpened] = useState(open);
  const available = chat !== null && CHAT_ROUTES.has(route.name);
  useBarHeight(available && open);
  if (chat === null || !available) return null;
  const setOpen = (next: boolean): void => {
    storeOpen(next);
    setOpenState(next);
    if (next) setOpened(true);
  };
  return { chat, open, opened, setOpen };
}

export function ChatButton({ dock }: { readonly dock: ChatDock | null }): ReactElement | null {
  if (dock === null) return null;
  return (
    <button
      type="button"
      className="chat-toggle"
      aria-expanded={dock.open}
      aria-controls="chat-panel"
      data-testid="chat-toggle"
      onClick={() => {
        dock.setOpen(!dock.open);
      }}
    >
      Chat
    </button>
  );
}

export function ChatPanel({ dock }: { readonly dock: ChatDock | null }): ReactElement | null {
  if (dock === null || !dock.opened) return null;
  const close = (): void => {
    dock.setOpen(false);
  };
  return (
    <>
      {/* Phones: the dimmed page behind the drawer; one tap closes it (chat.css). */}
      <button
        type="button"
        className="chat-backdrop"
        hidden={!dock.open}
        aria-label="Close chat"
        tabIndex={-1}
        onClick={close}
      />
      <aside
        id="chat-panel"
        className="chat-panel"
        hidden={!dock.open}
        aria-label="Chat"
        data-testid="chat-panel"
      >
        <div className="chat-panel__head">
          <strong>Chat</strong>
          <button type="button" className="sbr-btn" data-testid="chat-close" onClick={close}>
            Close
          </button>
        </div>
        {/* The kit's frame: sandboxed (K17), strict-origin referrer, the game's theme. */}
        <WebsiteChatFrame
          room={dock.chat.room}
          path={dock.chat.path}
          className="chat-panel__frame"
        />
      </aside>
    </>
  );
}
