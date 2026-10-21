/**
 * @file   apps/web/src/host/HostConsole.tsx
 * @module web/host
 * @brief  The host's console for one match: lobby, start, live draw control, results (05 §3).
 *
 * Responsibility: in the lobby, the joined players, "Fill with N bots" (development only)
 *                 and Start; while running, the current and recent numbers, a big Draw next
 *                 (also on the Space key while no field has focus; usable only with host
 *                 draws and after the previous number's speed window closed, D10), the
 *                 timed/host switch and the seconds at any time (D8), standings with active
 *                 players first, prizes awarded, cut results in the match log, and abort with
 *                 a reason; at the end the final ranking. Pause applies to asynchronous
 *                 matches only and is not offered here (realtime).
 * Depends on:     react, ../playback, ../components/*, ../game/*, ../shell/http, ./HostDrawControls
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/05-api-design.md §3; docs/spec/11-admin-panel.md §3.2; docs/spec/01-game-design.md §5
 */
import { useState, type ReactElement } from 'react';

import { DrawTicker } from '../components/DrawTicker.js';
import { Banners, FinalPlacement, MatchLog, PrizeList } from '../components/Playback.js';
import { Standings } from '../components/Standings.js';
import { CurrentBall } from '../game/CurrentBall.js';
import '../game/game.css';
import { gameTypeName, rulesLine } from '../game/labels.js';
import { useLiveMatch, type LiveState } from '../game/useLiveMatch.js';
import { playbackAt, type PlaybackView } from '../playback.js';
import { api, ApiError } from '../shell/http.js';
import { HostDrawControls } from './HostDrawControls.js';

export function HostConsole({ code }: { readonly code: string }): ReactElement {
  const { live, error } = useLiveMatch(code);
  if (live === null) return <p className="sbr-muted">{error ?? 'Loading the match…'}</p>;
  const view = playbackAt(live.view, live.view.events.length);
  return (
    <div className="sbr-stack" data-testid="host-console">
      <header>
        <h1>{live.match.title}</h1>
        <p className="sbr-muted">
          Code <strong data-testid="host-code">{live.match.code}</strong> ·{' '}
          {gameTypeName(live.match.gameType)} · {rulesLine(live.match)} ·{' '}
          <span data-testid="host-status">{live.match.status}</span>
        </p>
      </header>
      {live.match.status === 'lobby' ? (
        <HostLobby live={live} view={view} />
      ) : (
        <HostLive live={live} view={view} />
      )}
    </div>
  );
}

function HostLobby({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  const call = (path: string, body: unknown): void => {
    api(`/matches/${live.match.code}/${path}`, { method: 'POST', body })
      .then(() => {
        setMessage(null);
      })
      .catch((e: unknown) => {
        setMessage(e instanceof ApiError ? e.code : 'Error');
      });
  };
  return (
    <section className="sbr-panel sbr-stack">
      <h2>
        Players {live.match.players} / {live.match.maxPlayers}
      </h2>
      <ul className="waiting-players" data-testid="host-players">
        {view.standings.map((p) => (
          <li key={p.accountId}>{p.accountId}</li>
        ))}
      </ul>
      {import.meta.env.DEV ? (
        <BotFill
          onFill={(upTo) => {
            call('bots', { upTo });
          }}
        />
      ) : null}
      {live.match.startsAt === null ? (
        <button
          type="button"
          className="sbr-btn sbr-btn--primary sbr-btn--big"
          data-testid="start-match"
          onClick={() => {
            call('start', {});
          }}
        >
          Start match
        </button>
      ) : (
        <p className="countdown" data-testid="host-countdown">
          Starting… players see the countdown.
        </p>
      )}
      {message !== null ? <p className="lobby-error">{message}</p> : null}
    </section>
  );
}

function HostLive({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement {
  const result = live.view;
  const running = live.match.status === 'running';
  return (
    <div className="host-grid">
      <section className="sbr-stack">
        <CurrentBall
          draws={view.drawsSoFar}
          speedWindowMs={result.speedWindowMs}
          roundOver={view.roundOver}
        />
        <DrawTicker draws={view.drawsSoFar} speedWindowMs={result.speedWindowMs} />
        {running ? <HostDrawControls live={live} view={view} /> : null}
        {result.gameType === 'royale' ? null : <PrizeList result={result} view={view} />}
        <Banners banners={view.banners} />
        {view.finished ? <FinalPlacement result={result} view={view} /> : null}
        {running ? <Abort code={live.match.code} /> : null}
      </section>
      <aside className="sbr-stack">
        <Standings view={view} showSeasons={result.gameType === 'royale'} />
        <MatchLog banners={view.banners} />
      </aside>
    </div>
  );
}

function Abort({ code }: { readonly code: string }): ReactElement {
  const [reason, setReason] = useState('');
  return (
    <form
      className="sbr-row"
      onSubmit={(e) => {
        e.preventDefault();
        void api(`/matches/${code}/abort`, { method: 'POST', body: { reason } });
      }}
    >
      <input
        className="sbr-input"
        style={{ flex: '1 1 12rem' }}
        placeholder="Reason (shown to players)"
        value={reason}
        minLength={3}
        required
        onChange={(e) => {
          setReason(e.target.value);
        }}
        data-testid="abort-reason"
      />
      <button type="submit" className="sbr-btn sbr-btn--danger" data-testid="abort-match">
        Abort match
      </button>
    </form>
  );
}

// Development only: fill the lobby with bots that mark automatically.
function BotFill({ onFill }: { readonly onFill: (upTo: number) => void }): ReactElement {
  const [bots, setBots] = useState(20);
  return (
    <div className="sbr-row">
      <label className="sbr-row">
        Fill with
        <input
          className="sbr-input"
          style={{ width: '6rem' }}
          type="number"
          min={2}
          max={200}
          value={bots}
          data-testid="bots-up-to"
          onChange={(e) => {
            setBots(Number(e.target.value));
          }}
        />
        players (bots mark automatically)
      </label>
      <button
        type="button"
        className="sbr-btn"
        data-testid="fill-bots"
        onClick={() => {
          onFill(bots);
        }}
      >
        Fill with bots
      </button>
    </div>
  );
}
