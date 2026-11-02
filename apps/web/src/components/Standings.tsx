/**
 * @file   apps/web/src/components/Standings.tsx
 * @module web
 * @brief  Live standings: top 20 plus the owner's own rows, grouped (WP-08, D23).
 *
 * Responsibility: show the current ranking (players still in first, ./standingsOrder) as
 *                 ranked rows: rank, name, the season icons (royale), points; the owner's
 *                 row highlighted and, while the scrolling list has it out of view, repeated
 *                 in a strip of its own below the list (never over another row),
 *                 eliminated players dimmed with "out". Royale groups the
 *                 rows: "Still in" above the players still playing and "Out of the match"
 *                 above the others; in the final "In the final" and "Out of the match", each
 *                 out row with the cut and the points at that moment (from the server). The
 *                 order and the placement rule are unchanged (01 §7.5). With `onFollow` (a
 *                 player out or a spectator, D24) the names of players still in are buttons;
 *                 otherwise names link to profiles when the screen passes `profileHref`.
 * Depends on:     react, ./RankRow, ../playback, ../types, ./matchSide.css
 * Used by:        ./Playback, ../game/MatchScreen, ../host/HostConsole
 * Spec:           docs/spec/01-game-design.md §7.5, §13 (D23, D24), docs/spec/15-implementation-plan.md WP-08
 */
import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';

import { GroupLabel, RankRow, type ProfileHref } from './RankRow.js';
import type { PlaybackView, PlayerView } from '../playback.js';
import type { QuickTestResult } from '../types.js';
import './matchSide.css';

interface StandingsProps {
  readonly result: QuickTestResult;
  readonly view: PlaybackView;
  // A watcher follows a player still in (D24).
  readonly onFollow?: ((accountId: string) => void) | undefined;
  // Names link to profiles (the live match screen).
  readonly profileHref?: ProfileHref | undefined;
}

export function Standings({ result, view, onFollow, profileHref }: StandingsProps): ReactElement {
  const royale = result.gameType === 'royale';
  const final = royale && result.stagePlan[view.currentStage]?.kind === 'final';
  const shown = view.standings.filter((p, i) => i < 20 || p.isOwner);
  const firstOut = shown.findIndex((p) => p.eliminated);
  const own = shown.find((p) => p.isOwner);
  const { list, pinned } = useOwnRowOutOfView();
  const row = (player: PlayerView, pin = false) => (
    <PlayerRow
      key={player.accountId}
      rank={view.standings.indexOf(player) + 1}
      player={player}
      showSeasons={royale}
      outNote={final}
      onFollow={onFollow}
      href={profileHref?.(player.accountId) ?? null}
      pinned={pin}
    />
  );
  return (
    <section className="sbr-panel standings-panel" data-testid="standings-panel">
      <h3>Standings</h3>
      <ol className="rank-list" data-testid="standings" ref={list}>
        {royale && firstOut !== 0 ? (
          <GroupLabel key="in" text={final ? 'In the final' : 'Still in'} />
        ) : null}
        {shown.map((player, i) => [
          i === firstOut ? <GroupLabel key="out" text="Out of the match" divider /> : null,
          row(player),
        ])}
      </ol>
      {/* The viewer's row, in a strip of its own below the list while the list has it out
          of view: it never covers another row. */}
      {pinned && own !== undefined ? (
        <ol className="rank-list rank-pinned">{row(own, true)}</ol>
      ) : null}
    </section>
  );
}

// Whether the viewer's row lies outside the visible part of the scrolling list.
function useOwnRowOutOfView(): {
  readonly list: RefObject<HTMLOListElement | null>;
  readonly pinned: boolean;
} {
  const list = useRef<HTMLOListElement>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const root = list.current;
    const target = root?.querySelector('.rank-row.is-own');
    // Test DOMs (jsdom) have no IntersectionObserver; every browser has.
    if (root == null || target == null || typeof IntersectionObserver === 'undefined') {
      setPinned(false);
      return undefined;
    }
    const watch = new IntersectionObserver(
      ([entry]) => {
        setPinned((entry?.intersectionRatio ?? 1) < 0.99);
      },
      { root, threshold: [0, 0.99, 1] },
    );
    watch.observe(target);
    return () => {
      watch.disconnect();
    };
  });
  return { list, pinned };
}

interface RowProps {
  readonly rank: number;
  readonly player: PlayerView;
  readonly showSeasons: boolean;
  // In the final an out row says when the player went out and with how many points.
  readonly outNote: boolean;
  readonly onFollow: StandingsProps['onFollow'];
  readonly href: string | null;
  // The copy of the viewer's row in the strip below the list.
  readonly pinned: boolean;
}

function PlayerRow(props: RowProps): ReactElement {
  const { rank, player, showSeasons, outNote, onFollow } = props;
  const noted = outNote && player.eliminatedCut !== null;
  const note = noted
    ? `out in cut ${String(player.eliminatedCut)} · ${String(player.outPoints ?? player.points)} pts`
    : `${String(player.points)} pts`;
  return (
    <RankRow
      rank={rank}
      name={player.accountId}
      href={props.href}
      note={note}
      seasons={showSeasons ? player.seasons : null}
      own={player.isOwner}
      out={player.eliminated}
      outNoted={noted}
      onSelect={
        onFollow === undefined || player.eliminated
          ? undefined
          : () => {
              onFollow(player.accountId);
            }
      }
      attrs={{
        'data-testid': props.pinned ? 'own-row-pinned' : `standing-${player.accountId}`,
        'data-points': player.points,
        'data-seasons': player.seasonsActivated,
        'data-eliminated': player.eliminated ? 'true' : 'false',
      }}
    />
  );
}
