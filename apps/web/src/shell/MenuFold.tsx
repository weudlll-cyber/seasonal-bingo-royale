/**
 * @file   apps/web/src/shell/MenuFold.tsx
 * @module web/shell
 * @brief  The top bar's navigation and account items, folded into one menu button when they do not fit.
 *
 * Responsibility: wraps the bar's items in a panel and adds a "Menu" button before it. On
 *                 one row the button is hidden and the panel lays its items into the bar
 *                 (display: contents, ./menu.css); when they do not fit on one row (always below
 *                 960 px, ./useBarFold) the bar is brand, theme toggle and Menu, and the button
 *                 opens the panel under it. The
 *                 button reports aria-expanded and names the panel; opening moves the focus to
 *                 the panel's first item; Escape closes it and gives the focus back to the
 *                 button; a click outside, a new route, another sign-in or the chat opening
 *                 from it close it.
 * Depends on:     react, ./useBarFold, ./menu.css
 * Used by:        ./AppShell
 * Spec:           docs/concepts/fit-audit.md §5 item 7 (O1, O2); owner decision of 2026-11-20
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import { useBarFold } from './useBarFold.js';
import './menu.css';

interface MenuFoldProps {
  // The current route (and anything else that ends the menu's job, such as the chat opening)
  // and the account as keys: either changing closes the menu.
  readonly where: string;
  readonly who: string | null;
  readonly children: ReactNode;
}

export function MenuFold({ where, who, children }: MenuFoldProps): ReactElement {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Folded whenever the items do not fit on one row (./useBarFold).
  useBarFold(button, `${where} ${who ?? ''}`);

  // A new screen or another sign-in: the menu has done its job.
  useEffect(() => {
    setOpen(false);
  }, [where, who]);

  // Open: the focus moves to the first item; a press outside the menu closes it.
  useEffect(() => {
    if (!open) return undefined;
    panel.current?.querySelector<HTMLElement>('a[href], button, select')?.focus();
    const outside = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="sbr-btn shell-menu-button"
        aria-expanded={open}
        aria-controls="shell-menu"
        data-testid="menu-button"
        onClick={() => {
          setOpen(!open);
        }}
      >
        Menu
      </button>
      <div
        ref={panel}
        id="shell-menu"
        className="shell-menu"
        data-open={open}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || !open) return;
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }}
      >
        {children}
      </div>
    </>
  );
}
