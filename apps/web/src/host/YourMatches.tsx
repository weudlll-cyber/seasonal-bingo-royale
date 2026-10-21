/**
 * @file   apps/web/src/host/YourMatches.tsx
 * @module web/host
 * @brief  The host's open and running matches, each with "Manage", above the create form.
 *
 * Responsibility: list the matches the server reports as hosted by the signed-in account
 *                 (`youHost`) that are still open or running, so a host who left the console
 *                 finds it again. Hidden while there are none.
 * Depends on:     react, ../game/Lobby (match list, manageable), ../game/labels, ../shell/router
 * Used by:        ./CreateMatch
 * Spec:           docs/spec/11-admin-panel.md §3.2; docs/spec/05-api-design.md §2.3
 */
import type { ReactElement } from 'react';

import { gameTypeName, statusName } from '../game/labels.js';
import { manageable, useMatchList } from '../game/Lobby.js';
import { hrefOf } from '../shell/router.js';

export function YourMatches(): ReactElement | null {
  const { matches } = useMatchList();
  const mine = (matches ?? []).filter(manageable);
  if (mine.length === 0) return null;
  return (
    <section className="sbr-panel sbr-stack" data-testid="your-matches" aria-label="Your matches">
      <h2>Your matches</h2>
      <ul className="your-matches">
        {mine.map((m) => (
          <li key={m.code} className="your-match">
            <span>
              <strong>{m.title}</strong>
              <span className="sbr-muted">
                {' '}
                · Code {m.code} · {gameTypeName(m.gameType)} · {statusName(m.status)} · {m.players}/
                {m.maxPlayers} players
              </span>
            </span>
            <a
              className="sbr-btn sbr-btn--primary"
              href={hrefOf({ name: 'host', code: m.code })}
              data-testid={`your-manage-${m.code}`}
            >
              Manage
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
