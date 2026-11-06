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
 *                 embed page (`<site origin><path>?room=<room>&theme=<light|dark>`) is created
 *                 the first time the panel opens and kept while it is closed; it follows the
 *                 game's theme (<html data-theme>). Standalone: no button, no frame, no request.
 * Depends on:     react, ./router (types), ./session, ./chat.css
 * Used by:        ./AppShell
 * Spec:           docs/spec/07-integration-architecture.md §6; Seasonal Entertainment docs/EMBED.md
 */
import { useEffect, useState, type ReactElement } from 'react';

import type { Route } from './router.js';
import { useSession } from './session.js';
import './chat.css';

type Theme = 'light' | 'dark';

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

const documentTheme = (): Theme =>
  document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

// The game's theme as <html data-theme> holds it, followed live (./theme sets it).
function useDocumentTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(documentTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(documentTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => {
      observer.disconnect();
    };
  }, []);
  return theme;
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
  const theme = useDocumentTheme();
  if (dock === null || !dock.opened) return null;
  const close = (): void => {
    dock.setOpen(false);
  };
  const query = new URLSearchParams({ room: dock.chat.room, theme });
  const src = `${window.location.origin}${dock.chat.path}?${query.toString()}`;
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
        <iframe className="chat-panel__frame" title="Chat" src={src} data-testid="chat-frame" />
      </aside>
    </>
  );
}
