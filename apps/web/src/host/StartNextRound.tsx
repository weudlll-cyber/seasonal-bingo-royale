/**
 * @file   apps/web/src/host/StartNextRound.tsx
 * @module web/host
 * @brief  The host's "Start next round" between royale rounds.
 *
 * Responsibility: the pause between royale rounds when the host starts them (D14), or a timed
 *                 pause the host may end early (D21): the same intent starts the next round for
 *                 everyone; a refusal is said in words under the button. Nothing outside such a
 *                 pause.
 * Depends on:     react, ../game/labels, ../game/socket, ../game/useLiveMatch (types),
 *                 ../playback (types)
 * Used by:        ./HostConsole, ./WideConsole
 * Spec:           docs/spec/01-game-design.md §7 (D14, D21); docs/spec/05-api-design.md §3
 */
import { useState, type ReactElement } from 'react';

import { problemText } from '../game/labels.js';
import { intent } from '../game/socket.js';
import type { LiveState } from '../game/useLiveMatch.js';
import type { PlaybackView } from '../playback.js';

export function StartNextRound({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement | null {
  const [note, setNote] = useState<string | null>(null);
  // A timed pause between royale rounds: the host may end it early (D21).
  const timed =
    live.match.status === 'running' && view.roundOver && live.match.nextRoundAt !== null;
  if (!live.match.waitingForHost && !timed) return null;
  const { code } = live.match;
  const round = view.currentRound + 2;
  const early = !live.match.waitingForHost;
  return (
    <section className="sk-panel sbr-stack" data-testid="host-next-round-panel">
      <p>
        {early
          ? `The round is over. Round ${String(round)} starts after the pause, or now if you start it.`
          : `The round is over. Players wait for you to start round ${String(round)}.`}
      </p>
      <button
        type="button"
        className="sk-btn sk-btn--primary sk-btn--big"
        data-testid={early ? 'host-next-round-now' : 'host-next-round'}
        onClick={() => {
          void intent('round.next', { code }).then((a) => {
            setNote(a.ok ? null : problemText(a.code));
          });
        }}
      >
        {early ? 'Start next round now' : 'Start next round'}
      </button>
      {note !== null ? <p className="lobby-error">{note}</p> : null}
    </section>
  );
}
