/**
 * @file   apps/web/src/league/LeaderboardPage.tsx
 * @module web/league
 * @brief  The leaderboard: the current season by default, a period selector, the ranked rows.
 *
 * Responsibility: ask the server for the periods (active season first, then all-time, then past
 *                 seasons) and the chosen period's rows, 50 at a time with "Show more"; show
 *                 rank, name (a profile link), league points, wins and Season Completes exactly
 *                 as the server ranked them, equal players sharing a rank (the client computes
 *                 nothing, 01 §10, D28), the signed-in player's row highlighted, and their place
 *                 with neighbours when it is further down. States the counting rule (03 §11)
 *                 with the period's player minimum.
 * Depends on:     react, @sbr/contracts (types), ../shell/http, ../shell/router, ../shell/session,
 *                 ./useApiGet, ./league.css
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/01-game-design.md §10; docs/spec/05-api-design.md §2.4;
 *                 docs/spec/03-security-architecture.md §11
 */
import type {
  LeaderboardAround,
  LeaderboardPage as Page,
  LeaderboardPeriod,
  LeaderboardPeriods,
  LeaderboardRow,
} from '@sbr/contracts';
import { useState, type ReactElement } from 'react';

import { api } from '../shell/http.js';
import { hrefOf, navigate } from '../shell/router.js';
import { useSession } from '../shell/session.js';
import { useApiGet } from './useApiGet.js';
import './league.css';

export function LeaderboardPage({ periodId }: { readonly periodId: string | null }): ReactElement {
  const periods = useApiGet<LeaderboardPeriods>('/leaderboards');
  const items = periods.kind === 'ready' ? periods.value.items : [];
  const period = items.find((p) => p.id === periodId) ?? items[0];
  return (
    <section className="sbr-panel sbr-stack league-page" data-testid="leaderboard-page">
      <header className="league-head">
        <h1>Leaderboard</h1>
        {items.length > 1 && period !== undefined ? (
          <PeriodSelect periods={items} selected={period.id} />
        ) : null}
      </header>
      {periods.kind === 'failed' ? (
        <p className="sbr-muted">The leaderboard could not be loaded.</p>
      ) : null}
      {period === undefined ? null : <Board key={period.id} period={period} />}
    </section>
  );
}

function PeriodSelect(props: {
  readonly periods: readonly LeaderboardPeriod[];
  readonly selected: string;
}): ReactElement {
  return (
    <label className="sbr-field league-period">
      <span>Board</span>
      <select
        className="sbr-select"
        value={props.selected}
        data-testid="leaderboard-period"
        onChange={(e) => {
          navigate({ name: 'leaderboard', periodId: e.target.value });
        }}
      >
        {props.periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// The counting rule of 03 §11 in plain words, with the period's own minimum.
const ruleText = (p: LeaderboardPeriod): string =>
  `League points come from finished matches with the leaderboard switch on, at least ${String(p.minPlayers)} players with a confirmed e-mail address and no bots.`;

function Board({ period }: { readonly period: LeaderboardPeriod }): ReactElement {
  const { rows, next, loadMore, state } = useBoardRows(period.id);
  const signedIn = useSession().session?.account != null;
  const around = useApiGet<LeaderboardAround>(
    signedIn ? `/leaderboards/${encodeURIComponent(period.id)}/me` : null,
  );
  const mine = around.kind === 'ready' ? around.value.items : [];
  const showAround = mine.length > 0 && !rows.some((r) => r.isYou);
  if (state === 'loading') return <p className="sbr-muted">Loading the board…</p>;
  if (state === 'failed') return <p className="sbr-muted">The board could not be loaded.</p>;
  return (
    <>
      <p className="sbr-muted league-sub">
        {period.kind === 'season' ? `Season board · ${period.name}` : 'All-time board'}
      </p>
      {rows.length === 0 ? (
        <p data-testid="leaderboard-empty">
          Nobody has league points on this board yet. {ruleText(period)}
        </p>
      ) : (
        <BoardTable rows={rows} testId="leaderboard-rows" />
      )}
      {next === null ? null : (
        <button type="button" className="sbr-btn" onClick={loadMore}>
          Show more
        </button>
      )}
      {showAround ? (
        <>
          <h2>Your place</h2>
          <BoardTable rows={mine} testId="leaderboard-around" />
        </>
      ) : null}
      {rows.length === 0 ? null : (
        <p className="sbr-muted league-rule" data-testid="leaderboard-rule">
          {ruleText(period)}
        </p>
      )}
    </>
  );
}

// The first page, and the pages "Show more" added.
function useBoardRows(periodId: string) {
  const path = `/leaderboards/${encodeURIComponent(periodId)}`;
  const first = useApiGet<Page>(path);
  const [added, setAdded] = useState<readonly Page[]>([]);
  const pages = first.kind === 'ready' ? [first.value, ...added] : [];
  const next = pages.at(-1)?.nextCursor ?? null;
  const loadMore = (): void => {
    if (next === null) return;
    void api<Page>(`${path}?cursor=${encodeURIComponent(next)}`).then((p) => {
      setAdded((now) => [...now, p]);
    });
  };
  const state = first.kind === 'ready' ? 'ready' : first.kind === 'failed' ? 'failed' : 'loading';
  return { rows: pages.flatMap((p) => p.items), next, loadMore, state };
}

function BoardTable(props: {
  readonly rows: readonly LeaderboardRow[];
  readonly testId: string;
}): ReactElement {
  return (
    <table className="league-table" data-testid={props.testId}>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Player</th>
          <th scope="col">Points</th>
          <th scope="col">Wins</th>
          <th scope="col">Season Completes</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((r) => (
          <tr
            key={r.displayName}
            className={r.isYou ? 'is-own' : undefined}
            data-testid={`league-row-${r.displayName}`}
            data-name={r.displayName}
            data-rank={r.rank}
          >
            <td>{r.rank}</td>
            <th scope="row">
              <a href={hrefOf({ name: 'player', displayName: r.displayName })}>{r.displayName}</a>
              {r.isYou ? <span className="sbr-visually-hidden"> (you)</span> : null}
            </th>
            <td>{r.points}</td>
            <td>{r.wins}</td>
            <td>{r.seasonCompletes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
