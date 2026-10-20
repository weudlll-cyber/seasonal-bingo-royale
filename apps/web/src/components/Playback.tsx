/**
 * @file   apps/web/src/components/Playback.tsx
 * @module web
 * @brief  Playback view: banners, draw ticker, owner cards, standings, final (WP-08).
 *
 * Responsibility: present the match-in-progress view the owner watches. Pure React —
 *                 state lives in App.tsx and the view-model in playback.ts. Kept out
 *                 of App.tsx to keep that file under the 300-line limit.
 * Depends on:     react, ../types, ../playback, ./CardGrid, ./DrawTicker, ./OwnerCard,
 *                 ./Standings
 * Used by:        ../App
 * Spec:           docs/spec/01-game-design.md §13, docs/spec/15-implementation-plan.md WP-08
 */
import type { ReactElement } from 'react';

import { CardGrid } from './CardGrid.js';
import { DrawTicker } from './DrawTicker.js';
import { OwnerCard } from './OwnerCard.js';
import { Standings } from './Standings.js';
import type { PlaybackView } from '../playback.js';
import type { PlayerSummary, QuickTestResult } from '../types.js';

export interface PlaybackProps {
  readonly result: QuickTestResult;
  readonly view: PlaybackView;
}

export function Playback({ result, view }: PlaybackProps): ReactElement {
  const ownerPlayers = result.players.filter((p) => p.isOwner);
  const ownerCount = ownerPlayers.length;
  const drawnItems = result.events.flatMap((e) => (e.type === 'drawMade' ? [e.item] : []));
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <Header result={result} view={view} />
      <Banners banners={view.banners} />
      <DrawTicker draws={drawnItems} stepIndex={view.drawsSoFar.length - 1} />
      <OwnerCardsRow result={result} view={view} ownerPlayers={ownerPlayers} />
      <Standings view={view} />
      {view.finished ? <FinalPlacement result={result} /> : null}
      <aside aria-live="polite" style={{ color: '#9aa5b2' }}>
        {view.ownerEliminated && !view.finished ? (
          <p>You were eliminated — keep watching as a spectator.</p>
        ) : null}
        {ownerCount === 0 ? <p>Owner-free run: watching bots only.</p> : null}
      </aside>
    </div>
  );
}

function Header({ result, view }: PlaybackProps): ReactElement {
  const stage = result.stagePlan[view.currentStage];
  return (
    <header>
      <h2 style={{ margin: '0 0 .25rem' }}>
        {result.gameType}
        {stage !== undefined ? ` — stage ${String(view.currentStage + 1)} (${stage.kind})` : ''}
      </h2>
      <p style={{ margin: 0, color: '#9aa5b2' }}>
        round {String(view.currentRound + 1)} · draw {String(view.drawsSoFar.length)} /{' '}
        {String(view.totalDraws)}
      </p>
    </header>
  );
}

function Banners({
  banners,
}: {
  banners: readonly { readonly key: string; readonly text: string }[];
}): ReactElement {
  const last = banners.slice(-6);
  return (
    <ul
      aria-live="polite"
      data-testid="banners"
      style={{ margin: 0, padding: 0, listStyle: 'none', color: '#dfe6ee' }}
    >
      {last.map((b) => (
        <li
          key={b.key}
          style={{
            padding: '0.25rem 0.5rem',
            background: '#1a2130',
            borderRadius: '0.3rem',
            marginBottom: '0.2rem',
          }}
        >
          {b.text}
        </li>
      ))}
    </ul>
  );
}

interface OwnerRowProps {
  readonly result: QuickTestResult;
  readonly view: PlaybackView;
  readonly ownerPlayers: readonly PlayerSummary[];
}

function OwnerCardsRow({ result, view, ownerPlayers }: OwnerRowProps): ReactElement {
  if (ownerPlayers.length === 0) return <OwnerFallback result={result} view={view} />;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
        gap: '1rem',
      }}
    >
      {ownerPlayers.map((player) => (
        <OwnerCard key={player.accountId} player={player} result={result} view={view} />
      ))}
    </div>
  );
}

function OwnerFallback({ result, view }: PlaybackProps): ReactElement {
  // No owner cards configured — show the first few bot cards so the owner still sees a
  // 5×5 grid. Each one is read-only.
  const bots = result.players.filter((p) => !p.isOwner).slice(0, 4);
  const marksMap = new Map(view.standings.map((p) => [p.accountId, p.marks]));
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
        gap: '1rem',
      }}
    >
      {bots.map((bot) => (
        <div
          key={bot.accountId}
          style={{ background: '#1a2130', padding: '0.5rem', borderRadius: '0.5rem' }}
        >
          <CardGrid
            accountId={bot.accountId}
            cells={bot.card.cells}
            marks={marksMap.get(bot.accountId) ?? bot.marks}
          />
        </div>
      ))}
    </div>
  );
}

function FinalPlacement({ result }: { result: QuickTestResult }): ReactElement {
  const sorted = [...result.players].sort((a, b) => a.place - b.place);
  return (
    <section data-testid="final-placement">
      <h3 style={{ margin: '0 0 .25rem' }}>Final placement</h3>
      <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
        {sorted.slice(0, 20).map((p) => (
          <li
            key={p.accountId}
            data-testid={`final-row-${String(p.place)}`}
            style={{ color: p.isOwner ? '#afb84e' : '#dfe6ee' }}
          >
            #{p.place} {p.accountId} — {String(p.points)} pts
          </li>
        ))}
      </ol>
    </section>
  );
}
