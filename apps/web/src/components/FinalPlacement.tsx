/**
 * @file   apps/web/src/components/FinalPlacement.tsx
 * @module web
 * @brief  The final placement: the owner's place stated big, a podium for 1–3, then the list.
 *
 * Responsibility: "You finished #9 of 20" for the owner, places 1-3 as a podium in season colours,
 *                 then ranked rows from place 4 (top 20 unless changed in "Screens and texts",
 *                 plus the owner's row): royale shows points and seasons, eliminated dimmed with
 *                 "out" below a divider, ranked by when they went out, with the cut and points
 *                 then (01 §7.5, D23); classic ranks by prizes (01 §3a.2). One line states how
 *                 places are decided. No reveal: Bingo reveals nothing beyond its placings (the card
 *                 and the draws are on the screen). The podium shows each player's four season marks like the
 *                 rows below it (royale). Names link to profiles when `profileHref` is passed. Frame:
 *                 the kit's `ResultFrame` as a dense panel (`panel={{ level: 3 }}`, `dense`, K93);
 *                 the frame's look is the kit's (frames.css, K47), ./results.css styles Bingo's content.
 *                 In the wide form (owner decision of 2026-11-28) the line on how places are
 *                 decided stands under the list.
 * Depends on:     react, @seasonal/kit/react (ResultFrame), ./Podium, ./RankRow, ./Playback
 *                 (props), ../game/labels, ../playback, ../shell/session (useScreens), ../types,
 *                 ./results.css
 * Used by:        ./Playback, ../game/ArenaNotice, ../game/WideArena, ../host/HostConsole,
 *                 ../host/WideConsole
 * Spec:           docs/spec/01-game-design.md §3a.2, §7.5, §13
 */
import { ResultFrame } from '@seasonal/kit/react';
import type { ReactElement } from 'react';

import type { PlaybackProps } from './Playback.js';
import { Podium } from './Podium.js';
import { GroupLabel, RankRow, type ProfileHref } from './RankRow.js';
import { prizeName } from '../game/labels.js';
import type { PlaybackView, PlayerView } from '../playback.js';
import type { QuickTestResult, Season } from '../types.js';
import { useScreens } from '../shell/session.js';
import './results.css';

type Placed = QuickTestResult['players'][number];

export function FinalPlacement({
  result,
  view,
  profileHref,
  wide = false,
}: PlaybackProps & {
  readonly profileHref?: ProfileHref | undefined;
  readonly wide?: boolean;
}): ReactElement {
  const rows = useScreens().finalPlacementRows;
  const byId = new Map(view.standings.map((p) => [p.accountId, p]));
  const sorted = [...result.players].sort((a, b) => a.place - b.place);
  const owner = sorted.find((p) => p.isOwner);
  const podium = sorted.filter((p) => p.place <= 3);
  const rest = sorted.filter((p, i) => p.place > 3 && (i < rows || p.isOwner));
  const row = (p: Placed) => ({
    ...rowFacts(result, view, byId.get(p.accountId), p),
    href: profileHref?.(p.accountId) ?? null,
  });
  const rule = <PlacementRule gameType={result.gameType} />;
  const frame = (
    <ResultFrame
      game="bingo"
      panel={{ level: 3 }}
      // One card of small padding, the headline on one row with its lines (K93).
      dense
      headline="Final placement"
      lines={
        <>
          <OwnPlace owner={owner} of={sorted.length} />
          {wide ? null : rule}
        </>
      }
      placings={
        <Podium entries={podium.map((p) => podiumEntry(row(p), seasonsOf(result, byId, p), p))} />
      }
      {...(rest.length === 0
        ? {}
        : { more: <RankRows rest={rest} result={result} byId={byId} row={row} /> })}
      // Not fitted (a panel keeps its height), so the signature only names the placings.
      signature={sorted.map((p) => `${p.accountId}:${String(p.place)}`).join(' ')}
    />
  );
  return wide ? (
    <>
      {frame}
      {rule}
    </>
  ) : (
    frame
  );
}

// One of the podium's three steps.
function podiumEntry(
  facts: ReturnType<typeof rowFacts> & { readonly href: string | null },
  seasons: readonly Season[] | null,
  p: Placed,
) {
  const { href, note, attrs } = facts;
  return { place: p.place, name: p.accountId, href, note, seasons, own: p.isOwner, attrs };
}

function OwnPlace({
  owner,
  of,
}: {
  readonly owner: Placed | undefined;
  readonly of: number;
}): ReactElement | null {
  if (owner === undefined) return null;
  return (
    <p className="final-own" data-testid="final-own">
      You finished #{owner.place} of {of}
    </p>
  );
}

function PlacementRule({
  gameType,
}: {
  readonly gameType: QuickTestResult['gameType'];
}): ReactElement {
  return (
    <p className="sbr-muted final-rule" data-testid="final-rule">
      {PLACEMENT_RULE[gameType === 'royale' ? 'royale' : 'classic']}
    </p>
  );
}

interface RankRowsProps {
  readonly rest: readonly Placed[];
  readonly result: QuickTestResult;
  readonly byId: ReadonlyMap<string, PlayerView>;
  readonly row: (p: Placed) => ReturnType<typeof rowFacts> & { readonly href: string | null };
}

// A royale player's seasons (podium and rows alike); null where seasons do not exist.
function seasonsOf(
  result: QuickTestResult,
  byId: ReadonlyMap<string, PlayerView>,
  p: Placed,
): readonly Season[] | null {
  return result.gameType === 'royale' ? (byId.get(p.accountId)?.seasons ?? []) : null;
}

// Places from 4 as ranked rows; in a royale the players out below a divider (D23).
function RankRows({ rest, result, byId, row }: RankRowsProps): ReactElement {
  const firstOut = rest.findIndex((p) => byId.get(p.accountId)?.eliminated === true);
  return (
    <ol className="rank-list sk-dense-list">
      {rest.map((p, i) => [
        i === firstOut && i > 0 ? (
          <GroupLabel key="out-divider" text="Out of the match" divider />
        ) : null,
        <RankRow
          key={p.accountId}
          rank={p.place}
          name={p.accountId}
          seasons={seasonsOf(result, byId, p)}
          own={p.isOwner}
          {...row(p)}
        />,
      ])}
    </ol>
  );
}

// What one placed row shows: note, "out" and the test hooks.
function rowFacts(
  result: QuickTestResult,
  view: PlaybackView,
  player: PlayerView | undefined,
  p: Placed,
) {
  return {
    note: finalNote(result, view, player, p),
    out: player?.eliminated === true,
    // A royale out row says "out in cut K · P pts" itself (D23).
    outNoted: result.gameType === 'royale' && (player?.eliminatedCut ?? null) !== null,
    attrs: {
      'data-testid': `final-row-${String(p.place)}`,
      'data-place': p.place,
      'data-account': p.accountId,
    },
  };
}

// Royale: points; a player out says the cut and the points at that moment (01 §7.5, D23).
// Classic types: the prizes won.
function finalNote(
  result: QuickTestResult,
  view: PlaybackView,
  player: PlayerView | undefined,
  p: Placed,
): string {
  if (result.gameType === 'royale') {
    const cut = player?.eliminatedCut ?? null;
    if (cut === null) return `${String(p.points)} pts`;
    return `out in cut ${String(cut)} · ${String(player?.outPoints ?? p.points)} pts`;
  }
  const won = result.tickedPrizes.filter((k) =>
    view.prizeWinners[k]?.accountIds.includes(p.accountId),
  );
  return won.length === 0 ? 'no prize' : won.map(prizeName).join(', ');
}

// How places are decided, so a high score below a lower one makes sense (01 §7.5, §3a.2).
const PLACEMENT_RULE = {
  royale:
    'Places go by how far a player got: the final decides the top places, players out in an earlier cut rank lower, then points decide.',
  classic:
    'Places go by the most valuable prize won, then the number of prizes, then the marks on the card.',
} as const;
