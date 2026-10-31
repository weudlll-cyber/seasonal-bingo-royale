/**
 * @file   apps/web/src/game/Registration.tsx
 * @module web/game
 * @brief  The registration status of an open match, in the same words for host and players.
 *
 * Responsibility: one line for the console, the waiting room and the lobby card: without
 *                 a start time "Registration open until the host starts the match"; with a
 *                 set time "Starts at 22:25 (in 12 min)" (with the day when it is not today),
 *                 counting down live, plus "starts automatically" or "the host starts it"
 *                 (D16), or once the automatic start found too few players "Waiting for
 *                 players — at least N are needed to start" (N from the server); under
 *                 "start when full" "N places left"; "Starting…" only while the real
 *                 10-second countdown runs. Display only.
 * Depends on:     react, ../useSecondsUntil, ./useLiveMatch (types)
 * Used by:        ./WaitingRoom, ./Lobby, ../host/HostLobby
 * Spec:           docs/spec/01-game-design.md §7.6; docs/spec/05-api-design.md §2.3
 */
import type { ReactElement } from 'react';

import { useSecondsUntil } from '../useSecondsUntil.js';
import type { MatchSummary } from './useLiveMatch.js';

// "in 40 s", "in 12 min", "in 3 h 5 min", "in 1 day"; "start time reached" at 0.
function inText(seconds: number): string {
  if (seconds <= 0) return 'start time reached';
  if (seconds < 60) return `in ${String(seconds)} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `in ${String(minutes)} min`;
  if (minutes < 24 * 60) {
    const rest = minutes % 60;
    return `in ${String(Math.floor(minutes / 60))} h${rest > 0 ? ` ${String(rest)} min` : ''}`;
  }
  const days = Math.round(minutes / (24 * 60));
  return `in ${String(days)} ${days === 1 ? 'day' : 'days'}`;
}

// "at 22:25" today, "on Friday 23 October at 22:25" on another day.
function whenText(at: number, now: number): string {
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(at);
  if (new Date(at).toDateString() === new Date(now).toDateString()) return `at ${time}`;
  const day = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(at);
  return `on ${day} at ${time}`;
}

export function registrationText(match: MatchSummary, now: number): string {
  if (match.startsAt !== null) return 'Starting…';
  // D22: the start is due, but maintenance holds it.
  if (match.startHeld === true) return 'Held by maintenance — starts when maintenance ends';
  // The automatic start came and found too few players (D16): the match waits.
  if (match.tooFewAtStart) {
    return `Waiting for players — at least ${String(match.minPlayers)} are needed to start`;
  }
  const rule = match.settings.startRule;
  if (rule.kind === 'at') {
    const seconds = Math.max(0, Math.ceil((rule.at - now) / 1000));
    const who = rule.auto ? 'starts automatically' : 'the host starts it';
    return `Starts ${whenText(rule.at, now)} (${inText(seconds)}) · ${who}`;
  }
  if (rule.kind === 'whenFull') {
    const left = Math.max(0, match.maxPlayers - match.players);
    return `${String(left)} ${left === 1 ? 'place' : 'places'} left`;
  }
  return 'Registration open until the host starts the match';
}

export function RegistrationStatus({
  match,
  testId,
}: {
  readonly match: MatchSummary;
  readonly testId: string;
}): ReactElement {
  const rule = match.settings.startRule;
  // Re-renders four times a second while a set time counts down; the text reads the clock.
  useSecondsUntil(rule.kind === 'at' && match.startsAt === null ? rule.at : null);
  return <span data-testid={testId}>{registrationText(match, Date.now())}</span>;
}
