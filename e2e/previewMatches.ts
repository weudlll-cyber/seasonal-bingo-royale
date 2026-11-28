/**
 * @file   e2e/previewMatches.ts
 * @module e2e
 * @brief  Two test matches with bots in the local website-mode preview, held between rounds.
 *
 * Responsibility: through the preview's own address, as its one test member (who hosts): the
 *                 match "Preview: you play", in which the member's numbers are tapped at once,
 *                 so the member is still in, and the match "Preview: you watch", in which the
 *                 member never taps and is cut. Both draw by the host and pause until the host
 *                 starts the next round, so each screen stays for as long as it is looked at.
 *                 Development builds only (bots and the fast test rules). Prints the matches'
 *                 addresses and nothing of the session.
 * Used by:        `pnpm preview-matches` (docs/operator-guide.md "Test matches in the preview")
 * Spec:           docs/spec/12-testing-strategy.md §4
 */
import { setTimeout as sleep } from 'node:timers/promises';

import type { QuickTestResult } from '@sbr/contracts';

const ORIGIN = process.env['SBR_PREVIEW_ORIGIN'] ?? 'http://127.0.0.1:4490';
const BASE = `${ORIGIN}/games/bingo`;
const PLAYERS = 20;
// A royale ends long before this; past it something is wrong.
const MOST_STEPS = 600;
const ATTEMPTS = 8;

const jar = new Map<string, string>();

// One request with the session's cookies; a request over the server's limit waits and repeats.
async function call(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
  const response = await fetch(url, { ...init, headers, redirect: 'manual' });
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(';')[0] ?? '';
    const at = pair.indexOf('=');
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
  if (response.status !== 429) return response;
  await sleep(Number(response.headers.get('retry-after') ?? 5) * 1_000);
  return call(url, init);
}

// The preview's sign-in as the website does it: the login page, then the game's hand-over.
async function signIn(): Promise<void> {
  let next: string | null = `${ORIGIN}/login?next=%2Fgames%2Fbingo%2Fauth%2Fwebsite`;
  for (let hop = 0; hop < 6 && next !== null; hop += 1) {
    const response: Response = await call(next);
    const to: string | null = response.headers.get('location');
    next = to === null ? null : new URL(to, next).href;
  }
}

async function post(path: string, data: unknown): Promise<Response> {
  const session = (await (await call(`${BASE}/api/v1/session`)).json()) as { csrfToken: string };
  return call(`${BASE}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      origin: ORIGIN,
      'x-csrf-token': session.csrfToken,
    },
    body: JSON.stringify(data),
  });
}

async function must(path: string, data: unknown): Promise<string> {
  const response = await post(path, data);
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: ${String(response.status)} ${text}`);
  return text;
}

interface State {
  readonly me: string;
  readonly view: QuickTestResult;
}

async function stateOf(code: string): Promise<State> {
  const response = await call(`${BASE}/api/v1/matches/${code}/state`);
  if (!response.ok) throw new Error(`${code} state: ${String(response.status)}`);
  return (await response.json()) as State;
}

// The round now running (its draws so far and the member's cards), or null between rounds.
function openRound({ me, view }: State) {
  const from = view.events.findLastIndex((e) => e.type === 'roundStarted');
  const round = view.events[from];
  if (round?.type !== 'roundStarted') return null;
  const since = view.events.slice(from);
  if (since.some((e) => e.type === 'roundEnded')) return null;
  const drawn = since.flatMap((e) => (e.type === 'drawMade' ? [e.item] : []));
  return { drawn, cards: round.cardsByPlayer[me] ?? [] };
}

const isOut = ({ me, view }: State) =>
  view.events.some((e) => e.type === 'cutApplied' && e.eliminated.includes(me));

// Taps every cell of the member's cards that shows the newest number.
async function tap(code: string, state: State): Promise<void> {
  const round = openRound(state);
  const item = round?.drawn.at(-1);
  if (round === null || item === undefined) return;
  for (const [cardIndex, card] of round.cards.entries()) {
    for (const [cell, face] of card.cells.entries()) {
      if (face.kind !== 'free' && face.value === item)
        await post(`/matches/${code}/marks`, { cardIndex, cell });
    }
  }
}

// Draws until the round is over; waits first while the round has not begun.
async function playRound(code: string, member: 'plays' | 'watches'): Promise<State> {
  let begun = false;
  for (let step = 0; step < MOST_STEPS; step += 1) {
    const state = await stateOf(code);
    const open = openRound(state) !== null;
    if (begun && !open) return state;
    begun ||= open;
    if (open) {
      await post(`/matches/${code}/draw-next`, {});
      if (member === 'plays') await tap(code, await stateOf(code));
    }
    await sleep(open ? 700 : 1_000);
  }
  throw new Error(`${code}: the round did not end`);
}

async function createMatch(member: 'plays' | 'watches'): Promise<string> {
  const text = await must('/matches', {
    title: member === 'plays' ? 'Preview: you play' : 'Preview: you watch',
    gameType: 'royale',
    drawMode: 'host',
    missedNumbers:
      member === 'plays' ? { kind: 'autoMarkAfter', delayMs: 3_000 } : { kind: 'noAutoMark' },
    countsForLeaderboard: false,
    maxPlayers: PLAYERS,
    roundPause: { kind: 'host' },
    testProfile: 'fast',
    startRule: { kind: 'host' },
    devTools: true,
  });
  const { code } = JSON.parse(text) as { code: string };
  await must(`/matches/${code}/join`, {});
  await must(`/matches/${code}/bots`, { upTo: PLAYERS });
  await must(`/matches/${code}/start`, {});
  return code;
}

// The playing member's match: a card without luck is cut however fast the taps, so such a match
// is aborted and another played.
async function heldPlaying(): Promise<string> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const code = await createMatch('plays');
    if (!isOut(await playRound(code, 'plays'))) return code;
    await must(`/matches/${code}/abort`, { reason: 'preview: the member was cut' });
  }
  throw new Error('the member was cut in every attempt');
}

// The watching member's match, left in the pause after the member's cut.
async function heldWatching(): Promise<string> {
  const code = await createMatch('watches');
  while (!isOut(await playRound(code, 'watches'))) await must(`/matches/${code}/next-round`, {});
  return code;
}

await signIn();
for (const [name, held] of [
  ['play', heldPlaying],
  ['watch', heldWatching],
] as const) {
  const code = await held();
  console.log(`Preview: you ${name} (held between rounds)`);
  console.log(`  player screen: ${BASE}/#/match/${code}`);
  console.log(`  host console:  ${BASE}/#/host/${code}`);
}
