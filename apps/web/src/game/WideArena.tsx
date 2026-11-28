/**
 * @file   apps/web/src/game/WideArena.tsx
 * @module web/game
 * @brief  A live match for a player or spectator on a wide page: three columns under one head
 *         row (owner decisions of 2026-11-28).
 *
 * Responsibility: the head row (./MatchHead) with "Host console", and by the match's moment:
 *                 in a round, the ball, the newest numbers, the patterns (or prizes) and the
 *                 log's link at the left, the cards in the middle (a player still in: their
 *                 own; others: the watched ones), and at the right a player's short status
 *                 over the standings; between rounds, the notice strips and the recap at the
 *                 left, the cards, the standings; at the end the placement's list, the own
 *                 card and the status with the patterns. Nothing is computed here.
 * Depends on:     react, ../components/*, ../league/playerHref, ../playback (types),
 *                 ../shell/sharedCall, ./ArenaCards, ./AwaySummary, ./EndActions, ./HostLink,
 *                 ./Interlude, ./MatchHead, ./Registration (whenText), ./WideBall, ./labels,
 *                 ./useLiveMatch (types), ./wide.css
 * Used by:        ./MatchScreen
 * Spec:           docs/spec/01-game-design.md §13; docs/concepts/fit-audit.md §12
 */
import type { ReactElement } from 'react';

import { CutScreen } from '../components/CutScreen.js';
import { FinalNotice } from '../components/FinalNotice.js';
import { FinalPlacement } from '../components/FinalPlacement.js';
import { MatchLogLink } from '../components/MatchLogLink.js';
import { inPlay, OwnerStatusFor } from '../components/OwnerArea.js';
import { PatternsLine } from '../components/PatternsLine.js';
import { PatternsPanel } from '../components/PatternsPanel.js';
import { PrizeList } from '../components/Playback.js';
import { ScrollBox } from '../components/ScrollBox.js';
import { Standings } from '../components/Standings.js';
import { playerHref } from '../league/playerHref.js';
import type { PlaybackView } from '../playback.js';
import { ResultCallLink } from '../shell/sharedCall.js';
import { OwnCards, Watching } from './ArenaCards.js';
import { AwaySummary } from './AwaySummary.js';
import { EndActions } from './EndActions.js';
import { HostLink } from './HostLink.js';
import { currentRecap, Interlude } from './Interlude.js';
import { progressText } from './labels.js';
import { MatchHead } from './MatchHead.js';
import { whenText } from './Registration.js';
import type { LiveState } from './useLiveMatch.js';
import { WideBall } from './WideBall.js';
import './wide.css';

export interface WideArenaProps {
  readonly live: LiveState;
  readonly view: PlaybackView;
  // The player this watching screen follows, and the choice of one (D24).
  readonly followed: string | null;
  readonly follow: (name: string | null) => void;
}

// What every column reads.
interface Seen extends WideArenaProps {
  readonly owner: PlaybackView['owners'][number] | undefined;
  readonly watching: boolean;
}

export function WideArena(props: WideArenaProps): ReactElement {
  const { live, view } = props;
  const owner = view.owners[0];
  // A player out (after the round of their cut) or a spectator watches (D24).
  const watching = owner === undefined || !inPlay(owner, view);
  const seen: Seen = { ...props, owner, watching };
  const moment = view.finished
    ? 'result'
    : currentRecap(live.view.recaps, view) === null
      ? 'round'
      : 'pause';
  const withCard = moment !== 'result' || owner !== undefined;
  return (
    // data-seq: the server's event number this screen shows (the play-through compares it).
    <div className="arena wide fit-window" data-testid="arena" data-seq={live.seq}>
      <MatchHead
        live={live}
        view={view}
        progress={<span data-testid="arena-progress">{progressText(live, view)}</span>}
        actions={<HostLink match={live.match} short />}
      />
      {live.match.mode === 'async' ? <AwaySummary code={live.match.code} /> : null}
      <div className={`wide-grid wide-grid--${moment}${withCard ? '' : ' is-cardless'}`}>
        {moment === 'result' ? <ResultColumns {...seen} /> : null}
        {moment === 'round' ? <RoundLeft {...seen} /> : null}
        {moment === 'pause' ? <PauseLeft {...seen} /> : null}
        {moment === 'result' ? null : (
          <>
            <Cards {...seen} />
            <Right {...seen} status={moment === 'round' && !watching} />
          </>
        )}
      </div>
    </div>
  );
}

// The patterns of a royale round, the prizes of a classic one.
function Goals({ live, view }: Seen): ReactElement {
  const result = live.view;
  return result.gameType === 'royale' ? (
    <PatternsPanel result={result} view={view} />
  ) : (
    <PrizeList result={result} view={view} />
  );
}

// The final's fresh start and the quiet hours of an asynchronous match.
function Notices({ live, view }: Seen): ReactElement {
  return (
    <>
      <FinalNotice result={live.view} view={view} strip />
      {live.match.quietUntil !== null ? (
        <p className="notice-strip sk-panel" role="status" data-testid="quiet-hours">
          Quiet hours — the next number comes {whenText(live.match.quietUntil, Date.now())}.
        </p>
      ) : null}
    </>
  );
}

function RoundLeft(seen: Seen): ReactElement {
  const { live, view, watching } = seen;
  const tapping = !watching && live.view.markingMode !== 'auto';
  return (
    <section className="wide-col wide-left">
      <Notices {...seen} />
      <WideBall
        result={live.view}
        view={view}
        tapping={tapping}
        // A player still in: as many as two rows hold; a watcher: the last five.
        last={watching ? 5 : 10}
      />
      <Goals {...seen} />
      <MatchLogLink banners={view.banners} />
    </section>
  );
}

function PauseLeft(seen: Seen): ReactElement | null {
  const { live, view } = seen;
  const recap = currentRecap(live.view.recaps, view);
  if (recap === null) return null;
  return (
    <ScrollBox className="wide-col wide-left" role="region" aria-label="Round news" tabIndex={0}>
      {/* The cut's outcome stays until the next round starts. */}
      <CutScreen cut={view.lastCut} strip />
      <Notices {...seen} />
      <Interlude
        key={recap.roundIndex}
        recap={recap}
        pause={live.match.settings.roundPause}
        nextRoundAt={live.match.nextRoundAt}
        me={live.me}
        compact
      />
      <PatternsLine result={live.view} view={view} />
      <div className="wide-links">
        <ResultCallLink />
        <MatchLogLink banners={view.banners} />
      </div>
    </ScrollBox>
  );
}

function Cards({ live, view, watching, followed, follow }: Seen): ReactElement {
  return (
    <section
      className="wide-col wide-mid arena-cards"
      aria-label={watching ? 'Watched cards' : 'Your cards'}
    >
      {watching ? (
        <Watching
          live={live}
          view={view}
          followed={followed}
          onBack={() => {
            follow(null);
          }}
        />
      ) : (
        <OwnCards live={live} view={view} />
      )}
    </section>
  );
}

// The standings over the column's height, under a player's short status in a round.
function Right(seen: Seen & { readonly status: boolean }): ReactElement {
  const { live, view, owner, watching, follow, status } = seen;
  return (
    <aside className="wide-col wide-right">
      {status && owner !== undefined ? (
        <OwnerStatusFor result={live.view} view={view} owner={owner} short />
      ) : null}
      <Standings
        result={live.view}
        view={view}
        onFollow={watching ? follow : undefined}
        profileHref={playerHref}
      />
    </aside>
  );
}

// At the end: the placement's list, the own card, the status with the patterns.
function ResultColumns(seen: Seen): ReactElement {
  const { live, view, owner } = seen;
  return (
    <>
      <ScrollBox
        className="wide-col wide-left"
        role="region"
        aria-label="Final placement"
        tabIndex={0}
      >
        <FinalPlacement result={live.view} view={view} profileHref={playerHref} wide />
        <EndActions host={false} code={live.match.code} />
        <ResultCallLink />
      </ScrollBox>
      {owner === undefined ? null : (
        <section className="wide-col wide-mid arena-cards" aria-label="Your cards">
          <OwnCards live={live} view={view} />
        </section>
      )}
      <aside className="wide-col wide-right">
        {owner === undefined ? null : (
          <OwnerStatusFor result={live.view} view={view} owner={owner} short />
        )}
        <Goals {...seen} />
        <MatchLogLink banners={view.banners} />
      </aside>
    </>
  );
}
