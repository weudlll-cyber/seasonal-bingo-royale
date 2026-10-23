/**
 * @file   apps/web/src/components/Standings.tsx
 * @module web
 * @brief  Live standings: top 20 plus the owner's own rows outside the top 20 (WP-08).
 *
 * Responsibility: show the current ranking (players still in first, ./standingsOrder) as
 *                 ranked rows: rank, name, the season icons (royale), points; the owner's
 *                 row highlighted, eliminated players dimmed with "out" below a divider.
 * Depends on:     react, ./RankRow, ../playback
 * Used by:        ./Playback, ../game/MatchScreen, ../host/HostConsole
 * Spec:           docs/spec/01-game-design.md §7.5, §13, docs/spec/15-implementation-plan.md WP-08
 */
import type { ReactElement } from 'react';

import { OutDivider, RankRow } from './RankRow.js';
import type { PlaybackView, PlayerView } from '../playback.js';

// showSeasons: seasons exist in royale only (01 §3a).
export function Standings({
  view,
  showSeasons,
}: {
  view: PlaybackView;
  showSeasons: boolean;
}): ReactElement {
  const shown = view.standings.filter((p, i) => i < 20 || p.isOwner);
  const firstOut = shown.findIndex((p) => p.eliminated);
  return (
    <section className="sbr-panel">
      <h3>Standings</h3>
      <ol className="rank-list" data-testid="standings">
        {shown.map((player, i) => [
          i === firstOut && i > 0 ? <OutDivider key="out-divider" /> : null,
          <PlayerRow
            key={player.accountId}
            rank={view.standings.indexOf(player) + 1}
            player={player}
            showSeasons={showSeasons}
          />,
        ])}
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
    <RankRow
      rank={rank}
      name={player.accountId}
      note={`${String(player.points)} pts`}
      seasons={showSeasons ? player.seasons : null}
      own={player.isOwner}
      out={player.eliminated}
      attrs={{
        'data-testid': `standing-${player.accountId}`,
        'data-points': player.points,
        'data-seasons': player.seasonsActivated,
        'data-eliminated': player.eliminated ? 'true' : 'false',
      }}
    />
  );
}
