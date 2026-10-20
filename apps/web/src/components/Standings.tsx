/**
 * @file   apps/web/src/components/Standings.tsx
 * @module web
 * @brief  Live standings: top 20 + the owner's own row if outside top 20 (WP-08).
 *
 * Responsibility: show the current ranking in points-descending order with the owner
 *                 highlighted. Used by the player client's live scoreboard panel.
 * Depends on:     react, ../playback
 * Used by:        ../App
 * Spec:           docs/spec/01-game-design.md §13, docs/spec/15-implementation-plan.md WP-08
 */
import type { ReactElement } from 'react';

import type { PlaybackView } from '../playback.js';
import type { PlayerSummary } from '../types.js';

export interface StandingsProps {
  readonly view: PlaybackView;
}

export function Standings({ view }: StandingsProps): ReactElement {
  const top = view.standings.slice(0, 20);
  const owner = view.ownerStanding;
  const includeOwner: boolean = owner !== null && !top.some((p) => p.accountId === owner.accountId);
  return (
    <section>
      <h3 style={{ margin: '0 0 0.25rem' }}>Standings</h3>
      <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
        {top.map((player, i) => (
          <PlayerRow key={player.accountId} rank={i + 1} player={player} />
        ))}
        {includeOwner && owner !== null ? (
          <PlayerRow rank={view.standings.indexOf(owner) + 1} player={owner} />
        ) : null}
      </ol>
    </section>
  );
}

function PlayerRow({ rank, player }: { rank: number; player: PlayerSummary }): ReactElement {
  return (
    <li style={{ color: player.isOwner ? '#afb84e' : '#dfe6ee' }}>
      #{rank} {player.accountId} — {String(player.points)} pts · seasons{' '}
      {String(player.seasonsActivated)}
      {player.shieldCharges > 0 && ` · shield x${String(player.shieldCharges)}`}
    </li>
  );
}
