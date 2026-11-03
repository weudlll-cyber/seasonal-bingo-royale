/**
 * @file   apps/web/src/league/ProfilePage.tsx
 * @module web/league
 * @brief  A player's public profile: figures, badges and the last finished matches.
 *
 * Responsibility: ask the server for the profile by display name and show matches played,
 *                 wins, best placement, Season Completes (counted without matches with bots,
 *                 as one line says, D29), the badges and the last 10 finished matches (place of
 *                 how many, whether they gave league points and if not why, a link to the
 *                 match) exactly as sent — no e-mail, no real name (01 §10). An unknown name
 *                 says so.
 * Depends on:     react, @sbr/contracts (types), ../shell/router, ./useApiGet, ./league.css
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/01-game-design.md §10; docs/spec/05-api-design.md §2.2
 */
import type { LeagueOutcome, PlayerProfile, ProfileMatch } from '@sbr/contracts';
import type { ReactElement } from 'react';

import { hrefOf } from '../shell/router.js';
import { useApiGet } from './useApiGet.js';
import './league.css';

export function ProfilePage({ displayName }: { readonly displayName: string }): ReactElement {
  const loaded = useApiGet<PlayerProfile>(`/players/${encodeURIComponent(displayName)}`);
  return (
    <section className="sbr-panel sbr-stack league-page" data-testid="profile-page">
      {loaded.kind === 'ready' ? (
        <Profile p={loaded.value} />
      ) : (
        <>
          <h1>{displayName}</h1>
          {loaded.kind === 'failed' ? (
            <p data-testid="profile-missing">
              {loaded.code === 'NOT_FOUND'
                ? 'There is no player with this name.'
                : 'The profile could not be loaded.'}
            </p>
          ) : (
            <p className="sbr-muted">Loading the profile…</p>
          )}
        </>
      )}
      <a className="sbr-btn league-back" href={hrefOf({ name: 'leaderboard', periodId: null })}>
        To the leaderboard
      </a>
    </section>
  );
}

function Profile({ p }: { readonly p: PlayerProfile }): ReactElement {
  return (
    <>
      <h1 data-testid="profile-name">{p.displayName}</h1>
      <dl className="league-stats">
        <Stat label="Matches played" value={String(p.matchesPlayed)} testId="profile-matches" />
        <Stat label="Wins" value={String(p.wins)} testId="profile-wins" />
        <Stat
          label="Best placement"
          value={p.bestPlacement === null ? '–' : `#${String(p.bestPlacement)}`}
          testId="profile-best"
        />
        <Stat
          label="Season Completes"
          value={String(p.seasonCompletes)}
          testId="profile-season-completes"
        />
      </dl>
      <p className="sbr-muted" data-testid="profile-figures-rule">
        Counted from finished matches without bots.
      </p>
      <div className="sbr-row" data-testid="profile-badges">
        {p.badges.length === 0 ? (
          <span className="sbr-muted">No badges yet.</span>
        ) : (
          p.badges.map((b) => (
            <span key={b.id} className="sbr-chip">
              {b.name} ×{b.count}
            </span>
          ))
        )}
      </div>
      <h2>Recent matches</h2>
      {p.recentMatches.length === 0 ? (
        <p className="sbr-muted">No finished matches yet.</p>
      ) : (
        <ol className="league-matches">
          {p.recentMatches.map((m) => (
            <RecentMatch key={m.code} m={m} />
          ))}
        </ol>
      )}
    </>
  );
}

function Stat(props: {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
}): ReactElement {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd data-testid={props.testId}>{props.value}</dd>
    </div>
  );
}

// Why a match gave no league points, in plain words (the reason is the server's).
const LEAGUE_TEXT: Readonly<Record<LeagueOutcome, string>> = {
  counted: 'League points',
  switchOff: 'No league points: the leaderboard switch was off',
  bots: 'No league points: bots played',
  notVerified: 'No league points: e-mail address not confirmed',
  tooFewPlayers: 'No league points: too few verified players',
};

function RecentMatch({ m }: { readonly m: ProfileMatch }): ReactElement {
  return (
    <li
      className="league-match"
      data-testid={`profile-match-${m.code}`}
      data-league={m.league}
      data-place={m.place ?? ''}
    >
      <a href={hrefOf({ name: 'match', code: m.code })}>{m.title}</a>
      <span className="league-place">
        {m.place === null ? 'not placed' : `#${String(m.place)} of ${String(m.players)}`}
      </span>
      <span className={m.league === 'counted' ? 'league-note is-counted' : 'league-note'}>
        {LEAGUE_TEXT[m.league]}
      </span>
    </li>
  );
}
