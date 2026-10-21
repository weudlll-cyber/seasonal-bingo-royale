/**
 * @file   apps/web/src/components/Standings.tsx
 * @module web
 * @brief  Live standings: top 20 plus the owner's own rows outside the top 20 (WP-08).
 *
 * Responsibility: show the current ranking in points-descending order, owners
 *                 highlighted, eliminated players marked "out".
 * Depends on:     react, ../playback
 * Used by:        ./Playback
 * Spec:           docs/spec/01-game-design.md §13, docs/spec/15-implementation-plan.md WP-08
 */
import type { ReactElement } from 'react';

import type { PlaybackView, PlayerView } from '../playback.js';

// showSeasons: season counts exist in royale only (01 §3a).
export function Standings({
  view,
  showSeasons,
}: {
  view: PlaybackView;
  showSeasons: boolean;
}): ReactElement {
  const top = view.standings.slice(0, 20);
  const extraOwners = view.standings.filter((p, i) => p.isOwner && i >= 20);
  return (
    <section>
      <h3 style={{ margin: '0 0 0.25rem' }}>Standings</h3>
      <ol style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'none' }} data-testid="standings">
        {top.map((player, i) => (
          <PlayerRow
            key={player.accountId}
            rank={i + 1}
            player={player}
            showSeasons={showSeasons}
          />
        ))}
        {extraOwners.map((player) => (
          <PlayerRow
            key={player.accountId}
            rank={view.standings.indexOf(player) + 1}
            player={player}
            showSeasons={showSeasons}
          />
        ))}
      </ol>
    </section>
  );
}

function PlayerRow({
  rank,
  player,
  showSeasons,
}: {
  rank: number;
  player: PlayerView;
  showSeasons: boolean;
}): ReactElement {
  return (
    <li
      data-testid={`standing-${player.accountId}`}
      data-points={player.points}
      data-seasons={player.seasonsActivated}
      data-eliminated={player.eliminated ? 'true' : 'false'}
      style={{
        color: player.isOwner ? '#afb84e' : '#dfe6ee',
        opacity: player.eliminated ? 0.6 : 1,
      }}
    >
      #{rank} {player.accountId} — {String(player.points)} pts
      {showSeasons ? ` · seasons ${String(player.seasonsActivated)}` : ''}
      {player.eliminated ? ' · out' : ''}
    </li>
  );
}
