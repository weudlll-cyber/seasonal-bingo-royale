/**
 * @file   apps/web/src/components/FinalPlacement.tsx
 * @module web
 * @brief  The final placement: the owner's place stated big, a podium for 1–3, then the list.
 *
 * Responsibility: "You finished #9 of 20" for the owner, places 1–3 as a podium in season
 *                 colours, then places from 4 as ranked rows (top 20 plus the owner's own
 *                 row): royale shows points and seasons, eliminated players dimmed with
 *                 "out" below a divider, ranked by when they went out (01 §7.5); classic
 *                 types rank by prizes (01 §3a.2), so a row lists the prizes won. One line
 *                 states how places are decided.
 * Depends on:     react, ./Podium, ./RankRow, ./Playback (props), ../game/labels, ../playback, ../types
 * Used by:        ./Playback, ../game/MatchScreen, ../host/HostConsole
 * Spec:           docs/spec/01-game-design.md §3a.2, §7.5, §13
 */
import type { ReactElement } from 'react';

import type { PlaybackProps } from './Playback.js';
import { Podium } from './Podium.js';
import { OutDivider, RankRow } from './RankRow.js';
import { prizeName } from '../game/labels.js';
import type { PlaybackView } from '../playback.js';
import type { QuickTestResult } from '../types.js';

type Placed = QuickTestResult['players'][number];

export function FinalPlacement({ result, view }: PlaybackProps): ReactElement {
  const byId = new Map(view.standings.map((p) => [p.accountId, p]));
  const sorted = [...result.players].sort((a, b) => a.place - b.place);
  const owner = sorted.find((p) => p.isOwner);
  const podium = sorted.filter((p) => p.place <= 3);
  const rest = sorted.filter((p, i) => p.place > 3 && (i < 20 || p.isOwner));
  const firstOut = rest.findIndex((p) => byId.get(p.accountId)?.eliminated === true);
  const row = (p: Placed) => ({
    note: finalNote(result, view, p),
    out: byId.get(p.accountId)?.eliminated === true,
    attrs: {
      'data-testid': `final-row-${String(p.place)}`,
      'data-place': p.place,
      'data-account': p.accountId,
    },
  });
  return (
    <section className="sbr-panel final" data-testid="final-placement">
      <h3>Final placement</h3>
      {owner === undefined ? null : (
        <p className="final-own" data-testid="final-own">
          You finished #{owner.place} of {sorted.length}
        </p>
      )}
      <p className="sbr-muted final-rule" data-testid="final-rule">
        {PLACEMENT_RULE[result.gameType === 'royale' ? 'royale' : 'classic']}
      </p>
      <Podium
        entries={podium.map((p) => ({
          place: p.place,
          name: p.accountId,
          note: row(p).note,
          own: p.isOwner,
          attrs: row(p).attrs,
        }))}
      />
      {rest.length === 0 ? null : (
        <ol className="rank-list">
          {rest.map((p, i) => [
            i === firstOut && i > 0 ? <OutDivider key="out-divider" /> : null,
            <RankRow
              key={p.accountId}
              rank={p.place}
              name={p.accountId}
              seasons={result.gameType === 'royale' ? (byId.get(p.accountId)?.seasons ?? []) : null}
              own={p.isOwner}
              {...row(p)}
            />,
          ])}
        </ol>
      )}
    </section>
  );
}

// Royale: points (eliminated players keep the score they had when they went out, 01 §7.5).
// Classic types: the prizes won.
function finalNote(result: QuickTestResult, view: PlaybackView, p: Placed): string {
  if (result.gameType === 'royale') return `${String(p.points)} pts`;
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
