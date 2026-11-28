/**
 * @file   apps/web/src/components/MatchLogLink.tsx
 * @module web
 * @brief  "Whole match log" as a link that opens the log over the screen (owner decision of
 *         2026-11-28).
 *
 * Responsibility: the link with the number of lines and, once pressed, a sheet over the page
 *                 with every line of the match (newest first, each round's lines under its
 *                 separator once there is more than one round), scrolling inside itself, with a
 *                 Close button; Escape closes it too, and the focus goes back to the link.
 *                 Nothing while there is no line yet. Display only.
 * Depends on:     react, ../playback (types), ./RecentEvents (the rounds), ./ScrollBox
 * Used by:        ../game/WideArena, ../host/WideConsole
 * Spec:           docs/spec/01-game-design.md §13; docs/concepts/fit-audit.md §12
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';

import type { Banner } from '../playback.js';
import { LogRounds } from './RecentEvents.js';
import { ScrollBox } from './ScrollBox.js';

export function MatchLogLink({
  banners,
}: {
  readonly banners: readonly Banner[];
}): ReactElement | null {
  const [open, setOpen] = useState(false);
  const link = useRef<HTMLButtonElement>(null);
  if (banners.length === 0) return null;
  const close = (): void => {
    setOpen(false);
    link.current?.focus();
  };
  return (
    <>
      <button
        type="button"
        ref={link}
        className="log-link"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
      >
        Whole match log ({String(banners.length)})
      </button>
      {open ? <LogSheet banners={banners} onClose={close} /> : null}
    </>
  );
}

function LogSheet({
  banners,
  onClose,
}: {
  readonly banners: readonly Banner[];
  readonly onClose: () => void;
}): ReactElement {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    button.current?.focus();
  }, []);
  return (
    <div
      className="log-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Whole match log"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <section className="sk-panel log-sheet">
        <header className="log-sheet__head">
          <h2>Whole match log</h2>
          <button type="button" ref={button} className="sk-btn" onClick={onClose}>
            Close
          </button>
        </header>
        <ScrollBox className="log-sheet__lines" role="region" aria-label="Log lines" tabIndex={0}>
          <div data-testid="match-log">
            <LogRounds banners={banners} />
          </div>
        </ScrollBox>
      </section>
    </div>
  );
}
