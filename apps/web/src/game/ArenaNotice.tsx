/**
 * @file   apps/web/src/game/ArenaNotice.tsx
 * @module web/game
 * @brief  What shows above the arena (./MatchScreen): the end, the cut, the recap, quiet hours, waiting.
 *
 * Responsibility: at the end the final placement with the end actions; otherwise the cut
 *                 screen (a survivor's goes once the next round draws), the final's fresh start
 *                 (D23), the recap of the round just played (./Interlude, D20), the quiet-hours
 *                 notice of an asynchronous match (01 §5) and, while the match waits for its host
 *                 between rounds, "Waiting for the host to start round N" (D14). Display only.
 * Depends on:     react, ../components/*, ../league/playerHref, ../playback (types), ./EndActions,
 *                 ./Interlude, ./Registration (whenText), ./useLiveMatch (types)
 * Used by:        ./MatchScreen
 * Spec:           docs/spec/01-game-design.md §5, §7, §11, §13
 */
import type { ReactElement } from 'react';

import { CutScreen } from '../components/CutScreen.js';
import { FinalNotice } from '../components/FinalNotice.js';
import { FinalPlacement } from '../components/FinalPlacement.js';
import { playerHref } from '../league/playerHref.js';
import type { PlaybackView } from '../playback.js';
import { EndActions } from './EndActions.js';
import { currentRecap, Interlude } from './Interlude.js';
import { whenText } from './Registration.js';
import type { LiveState } from './useLiveMatch.js';

// Above the arena: the final placement at the end; otherwise the cut screen (a survivor's
// goes once the next round draws), the final's fresh start (D23), the recap of the round
// just played (D20) and, while the match waits for its host between rounds, the waiting
// notice (D14).
export function ArenaNotice({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement {
  if (view.finished) {
    return (
      <>
        <FinalPlacement result={live.view} view={view} profileHref={playerHref} />
        <EndActions host={false} code={live.match.code} />
      </>
    );
  }
  const recap = currentRecap(live.view.recaps, view);
  const cut = view.lastCut;
  const survivedEarlier =
    cut !== null &&
    cut.round < view.currentRound &&
    view.drawsSoFar.length > 0 &&
    cut.owners.every((o) => o.outcome !== 'eliminated');
  return (
    <>
      {survivedEarlier ? null : <CutScreen cut={cut} nextRoundAt={live.match.nextRoundAt} />}
      <FinalNotice result={live.view} view={view} />
      {/* The recap of the round just played, below the cut screen (D20). */}
      {recap === null ? null : (
        <Interlude
          key={recap.roundIndex}
          recap={recap}
          pause={live.match.settings.roundPause}
          nextRoundAt={live.match.nextRoundAt}
          me={live.me}
        />
      )}
      {live.match.quietUntil !== null ? (
        <p className="sbr-panel" role="status" data-testid="quiet-hours">
          Quiet hours — the next number comes {whenText(live.match.quietUntil, Date.now())}.
        </p>
      ) : null}
      {live.match.waitingForHost ? (
        <p className="sbr-panel" role="status" data-testid="waiting-for-host">
          Waiting for the host to start round {view.currentRound + 2}
        </p>
      ) : null}
    </>
  );
}
