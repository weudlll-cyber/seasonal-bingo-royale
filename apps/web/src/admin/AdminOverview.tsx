/**
 * @file   apps/web/src/admin/AdminOverview.tsx
 * @module web/admin
 * @brief  The admin area's Overview: health line, maintenance on and off, every open match.
 *
 * Responsibility: what GET /admin/overview answers (Admins only; anyone else reads that the
 *                 page is for Admins): the version and how long the server runs; maintenance
 *                 with its state, a reason for players and one button to switch it (the flag
 *                 `sbr maintenance` sets); the switches (./AdminSwitches); every match in its
 *                 lobby or running, newest first,
 *                 with type, state, players and host, and Abort with a reason shown to players
 *                 (../host/AbortMatch on the admin route), after which the list reloads. The
 *                 server checks every permission and writes the audit log.
 * Depends on:     react, ../game/labels, ../host/AbortMatch, ../shell/http, ../types, ./AdminNav,
 *                 ./AdminSwitches, ./admin.css
 * Used by:        ./AdminArea
 * Spec:           docs/concepts/admin-area.md §4 (Overview), §9 piece 1
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { gameTypeName, problemText } from '../game/labels.js';
import { AbortMatch } from '../host/AbortMatch.js';
import { api, ApiError } from '../shell/http.js';
import type { GameType } from '../types.js';
import { AdminNav } from './AdminNav.js';
import { AdminSwitches, type Switches } from './AdminSwitches.js';
import './admin.css';

interface OpenMatch {
  readonly code: string;
  readonly title: string;
  readonly gameType: GameType;
  readonly mode: 'realtime' | 'async';
  readonly status: 'lobby' | 'running';
  readonly players: number;
  readonly maxPlayers: number;
  readonly host: string | null;
}

interface Maintenance {
  readonly on: boolean;
  readonly reason: string | null;
}

interface Overview {
  readonly matches: readonly OpenMatch[];
  readonly maintenance: Maintenance;
  readonly switches: Switches;
  readonly health: { readonly version: string; readonly startedAt: number };
}

type Load = { kind: 'loading' } | { kind: 'ready'; value: Overview } | { kind: 'refused' };

// "3 h 5 min", "12 min", "2 days 4 h": how long the server has been running.
function uptimeText(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const [days, hours, mins] = [
    Math.floor(minutes / 1440),
    Math.floor(minutes / 60) % 24,
    minutes % 60,
  ];
  if (days > 0) return `${String(days)} day${days === 1 ? '' : 's'} ${String(hours)} h`;
  return hours > 0 ? `${String(hours)} h ${String(mins)} min` : `${String(mins)} min`;
}

export function AdminOverview(): ReactElement {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const reload = useCallback(() => {
    api<Overview>('/admin/overview')
      .then((value) => {
        setLoad({ kind: 'ready', value });
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError) setLoad({ kind: 'refused' });
      });
  }, []);
  useEffect(reload, [reload]);
  if (load.kind === 'loading') return <p className="sbr-muted">Loading the Overview…</p>;
  if (load.kind === 'refused') {
    return (
      <p className="sbr-panel" data-testid="admin-refused">
        This page is for Admins.
      </p>
    );
  }
  const { matches, maintenance, switches, health } = load.value;
  return (
    <div className="admin-page sbr-stack" data-testid="admin-overview">
      <h1>Overview</h1>
      <AdminNav current="overview" />
      <p className="sbr-muted" data-testid="admin-health">
        Version {health.version} · running for {uptimeText(Date.now() - health.startedAt)}
      </p>
      <MaintenancePanel value={maintenance} />
      <AdminSwitches value={switches} />
      <section className="sbr-panel sbr-stack" aria-labelledby="admin-matches-title">
        <h2 id="admin-matches-title">Open and running matches</h2>
        {matches.length === 0 ? <p className="sbr-muted">No match is open or running.</p> : null}
        <ul className="admin-matches">
          {matches.map((m) => (
            <MatchRow key={m.code} match={m} onAborted={reload} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function MatchRow({ match, onAborted }: { match: OpenMatch; onAborted: () => void }): ReactElement {
  const state = match.status === 'running' ? 'Running' : 'In the lobby';
  return (
    <li className="admin-match sbr-stack" data-testid={`admin-match-${match.code}`}>
      <div className="admin-match-head">
        <strong>{match.title}</strong>
        <span className="sbr-chip">{state}</span>
      </div>
      <p className="sbr-muted admin-match-facts">
        {gameTypeName(match.gameType)}
        {match.mode === 'async' ? ' · asynchronous' : ''} · code {match.code} ·{' '}
        {String(match.players)} / {String(match.maxPlayers)} players · host{' '}
        {match.host ?? 'a removed account'}
      </p>
      <AbortMatch
        code={match.code}
        path={`/admin/matches/${match.code}/abort`}
        onDone={onAborted}
      />
    </li>
  );
}

// Maintenance (09 §4): while on, no new match is created or started; running ones finish.
function MaintenancePanel({ value }: { readonly value: Maintenance }): ReactElement {
  const [state, setState] = useState(value);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toggle = (): void => {
    const body = state.on ? { on: false } : { on: true, reason };
    setError(null);
    api<Maintenance>('/admin/maintenance', { method: 'POST', body })
      .then(setState)
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? problemText(e.code) : problemText(''));
      });
  };
  return (
    <section className="sbr-panel sbr-stack" aria-labelledby="admin-maintenance-title">
      <h2 id="admin-maintenance-title">Maintenance</h2>
      <p data-testid="admin-maintenance-state">
        {state.on
          ? `Maintenance is on${state.reason === null ? '' : `: ${state.reason}`}`
          : 'Maintenance is off'}
      </p>
      <p className="sbr-muted">
        While it is on, nobody can create or start a match; running matches finish.
      </p>
      {state.on ? null : (
        <label className="sbr-field">
          <span>Reason for players (optional)</span>
          <input
            className="sbr-input"
            value={reason}
            data-testid="admin-maintenance-reason"
            onChange={(e) => {
              setReason(e.target.value);
            }}
          />
        </label>
      )}
      {error === null ? null : <p className="lobby-error">{error}</p>}
      <button
        type="button"
        className={state.on ? 'sbr-btn' : 'sbr-btn sbr-btn--danger'}
        data-testid="admin-maintenance-toggle"
        onClick={toggle}
      >
        {state.on ? 'Turn maintenance off' : 'Turn maintenance on'}
      </button>
    </section>
  );
}
