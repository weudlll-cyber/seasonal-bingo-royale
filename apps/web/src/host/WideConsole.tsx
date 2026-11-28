/**
 * @file   apps/web/src/host/WideConsole.tsx
 * @module web/host
 * @brief  The host's console on a wide page while a match runs and at its end (owner decisions of
 *         2026-11-28).
 *
 * Responsibility: the match screens' head row (../game/MatchHead) with the code and status,
 *                 and columns by the match's moment: in a round, the ball, the newest numbers
 *                 and the log's link; the draw controls and abort; the standings. Between
 *                 rounds, "Start next round" over the draw controls and abort in a column of
 *                 their own, so nothing covers them; the notices and the recap; the standings.
 *                 At the end the placement's list, and the prizes and the log's link.
 * Depends on:     react, ../components/*, ../game/*, ../playback (types), ../shell/sharedCall,
 *                 ./AbortMatch, ./HostDrawControls, ./StartNextRound
 * Used by:        ./HostConsole
 * Spec:           docs/spec/05-api-design.md §3; docs/spec/01-game-design.md §13;
 *                 docs/concepts/fit-audit.md §12
 */
import type { ReactElement, ReactNode } from 'react';

import { FinalNotice } from '../components/FinalNotice.js';
import { FinalPlacement } from '../components/FinalPlacement.js';
import { MatchLogLink } from '../components/MatchLogLink.js';
import { PrizeList } from '../components/Playback.js';
import { ScrollBox } from '../components/ScrollBox.js';
import { Standings } from '../components/Standings.js';
import { EndActions } from '../game/EndActions.js';
import { currentRecap, Interlude } from '../game/Interlude.js';
import { gameTypeName, progressText, rulesLine, statusName } from '../game/labels.js';
import { MatchHead } from '../game/MatchHead.js';
import type { LiveState } from '../game/useLiveMatch.js';
import { WideBall } from '../game/WideBall.js';
import type { PlaybackView } from '../playback.js';
import { ResultCallLink } from '../shell/sharedCall.js';
import { AbortMatch } from './AbortMatch.js';
import { HostDrawControls } from './HostDrawControls.js';
import { StartNextRound } from './StartNextRound.js';

interface Seen {
  readonly live: LiveState;
  readonly view: PlaybackView;
}

export function WideConsole({
  live,
  view,
  tools,
}: Seen & { readonly tools?: ReactNode }): ReactElement {
  const between =
    view.roundOver &&
    (live.match.waitingForHost ||
      live.match.nextRoundAt !== null ||
      currentRecap(live.view.recaps, view) !== null);
  const moment = view.finished ? 'result' : between ? 'pause' : 'round';
  return (
    <div className="host-console wide fit-window" data-testid="host-console" data-seq={live.seq}>
      <MatchHead
        live={live}
        view={view}
        progress={
          <>
            Code <strong data-testid="host-code">{live.match.code}</strong> ·{' '}
            <span data-testid="host-status" data-status={live.match.status}>
              {statusName(live.match)}
            </span>
            {` · ${progressText(live, view)}`}
          </>
        }
        rules={`${gameTypeName(live.match.gameType)} · ${rulesLine(live.match)}`}
        actions={tools}
      />
      <div className={`wide-grid wide-console wide-console--${moment}`}>
        {moment === 'result' ? <Ended live={live} view={view} /> : null}
        {moment === 'round' ? <Round live={live} view={view} /> : null}
        {moment === 'pause' ? <Pause live={live} view={view} /> : null}
        {moment === 'result' ? null : (
          <aside className="wide-col wide-right">
            <Standings result={live.view} view={view} />
          </aside>
        )}
      </div>
    </div>
  );
}

// The draw controls and abort of a running match.
function Controls({ live, view }: Seen): ReactElement | null {
  if (live.match.status !== 'running') return null;
  return (
    <>
      <HostDrawControls live={live} view={view} />
      <AbortMatch code={live.match.code} />
    </>
  );
}

function Prizes({ live, view }: Seen): ReactElement | null {
  return live.view.gameType === 'royale' ? null : <PrizeList result={live.view} view={view} />;
}

function Round({ live, view }: Seen): ReactElement {
  return (
    <>
      <section className="wide-col wide-left host-play">
        <WideBall
          result={live.view}
          view={view}
          tapping={live.view.markingMode !== 'auto'}
          last={10}
        />
        <Prizes live={live} view={view} />
        <MatchLogLink banners={view.banners} />
      </section>
      <section className="wide-col wide-mid host-controls">
        <FinalNotice result={live.view} view={view} strip />
        <Controls live={live} view={view} />
      </section>
    </>
  );
}

function Pause({ live, view }: Seen): ReactElement {
  const recap = currentRecap(live.view.recaps, view);
  return (
    <>
      <section className="wide-col wide-left host-controls">
        <StartNextRound live={live} view={view} />
        <Controls live={live} view={view} />
      </section>
      <ScrollBox className="wide-col wide-mid" role="region" aria-label="Round news" tabIndex={0}>
        <FinalNotice result={live.view} view={view} strip />
        {recap === null ? null : (
          <Interlude
            key={recap.roundIndex}
            recap={recap}
            pause={live.match.settings.roundPause}
            nextRoundAt={live.match.nextRoundAt}
            me={null}
            compact
          />
        )}
        <div className="wide-links">
          <ResultCallLink />
          <MatchLogLink banners={view.banners} />
        </div>
      </ScrollBox>
    </>
  );
}

function Ended({ live, view }: Seen): ReactElement {
  return (
    <>
      <ScrollBox
        className="wide-col wide-left host-end"
        role="region"
        aria-label="Final placement"
        tabIndex={0}
      >
        <FinalPlacement result={live.view} view={view} wide />
        <EndActions host code={live.match.code} />
        <ResultCallLink />
      </ScrollBox>
      <section className="wide-col wide-mid">
        <Prizes live={live} view={view} />
        <MatchLogLink banners={view.banners} />
      </section>
    </>
  );
}
