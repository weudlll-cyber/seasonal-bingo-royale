/**
 * @file   apps/server/test/liveSteps.integration.test.ts
 * @module server/test
 * @brief  The live frames give every screen exactly what a full state fetch gives (06 §8).
 *
 * Responsibility: three screens, a player, a spectator and the host, each load the match
 *                 once and then hold it only through the frames, applied with the protocol's own
 *                 rules the client uses (@sbr/contracts liveHeld: mergeAnswer, applyStep). After every step of a whole
 *                 royale (fast profile, host-started rounds: lobby, stages, rounds, cuts,
 *                 recaps, the final) and a whole classic match, each held view equals a fresh
 *                 full fetch for that viewer; the only exception is the player list's live points,
 *                 seasons and shield, which a step sends only with the list (a join, the first
 *                 round, the finish) and the screens never read in between. A gap (a step that
 *                 does not fit) fails the test. Every frame a player still in received holds no
 *                 other player's card, no draw order and no seed, and its own frames no
 *                 watched cards (D24, 03 §11); the spectator's own frames hold them.
 * Depends on:     vitest, @sbr/application, @sbr/contracts, ./socketKit, ./session, ./harness
 * Spec:           docs/spec/06-realtime-architecture.md §4, §8; docs/spec/01-game-design.md §9, §13
 */
import { waitingForHost, type MatchEngine } from '@sbr/application';
import {
  applyStep,
  mergeAnswer,
  type LiveAnswer,
  type LiveHeld,
  type LiveOwnFrame,
  type LiveStepFrame,
} from '@sbr/contracts';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SUITE_TIMEOUT_MS } from './harness.js';
import { signIn, type Client } from './session.js';
import { startSocketKit, type SocketKit } from './socketKit.js';

// What a screen holds; the summary as far as the protocol reads it.
type Summary = { readonly youHost: boolean | null };
type LiveState = LiveHeld<Summary>;

let kit: SocketKit;
let spectator: Client;

beforeAll(async () => {
  kit = await startSocketKit();
  spectator = await signIn(kit.harness.built.fastify, 'player-2');
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await kit.close();
}, SUITE_TIMEOUT_MS);

// A screen: what it holds, every frame it received, the gaps it met.
interface Screen {
  readonly client: Client;
  readonly socket: Socket;
  held: LiveState | null;
  readonly frames: unknown[];
  gaps: number;
}

async function fullFetch(client: Client, code: string): Promise<LiveState> {
  const r = await client.get(`/api/v1/matches/${code}/state?since=0`);
  return mergeAnswer(null, r.json<LiveAnswer<Summary>>());
}

// Opens a screen on the match: watch, load once, then apply each step with the client's code.
async function screen(client: Client, code: string): Promise<Screen> {
  const socket = kit.open(client.cookie);
  expect(await kit.connected(socket)).toBe('ok');
  const s: Screen = { client, socket, held: null, frames: [], gaps: 0 };
  let room: LiveStepFrame<Summary> | null = null;
  socket.on('events', (frame: LiveStepFrame<Summary>) => {
    s.frames.push(frame);
    room = frame;
  });
  socket.on('own', (own: LiveOwnFrame) => {
    s.frames.push(own);
    const step = room;
    room = null;
    if (s.held === null || own.s <= s.held.seq) return;
    const next = step === null ? null : applyStep(s.held, step, own);
    if (next === null) s.gaps += 1;
    else s.held = next;
  });
  expect((await kit.send(socket, 'match.watch', { code })).ok).toBe(true);
  s.held = await fullFetch(client, code);
  return s;
}

// The player list's live stats come only with the list; the screens do not read them.
function comparable(state: LiveState): unknown {
  const players = state.view.players.map((p) => ({
    ...p,
    points: 0,
    seasonsActivated: 0,
    shieldCharges: 0,
  }));
  return { ...state, view: { ...state.view, players } };
}

// Waits until every screen holds the match's seq, then compares each with a full fetch.
async function sameAsFetch(screens: readonly Screen[], engine: MatchEngine, id: string) {
  const { seq } = await engine.runner.current(id);
  const code = (await engine.runner.current(id)).record.code;
  await expect
    .poll(() => screens.every((s) => (s.held?.seq ?? 0) >= seq), { timeout: 5_000, interval: 10 })
    .toBe(true);
  for (const s of screens) {
    expect(s.gaps).toBe(0);
    expect(comparable(s.held as LiveState)).toEqual(comparable(await fullFetch(s.client, code)));
  }
}

// One step of the match as its scheduler would run it; false once it is over.
async function nextStep(engine: MatchEngine, id: string): Promise<boolean> {
  const m = await engine.runner.current(id);
  if (m.record.status === 'finished') return false;
  if (waitingForHost(m)) {
    await engine.startNextRound(id);
    return true;
  }
  await engine.handle({ matchId: id, kind: 'draw', dueAt: Date.now() });
  const drawIndex = ((await engine.runner.current(id)).state.currentRound?.draws.length ?? 0) - 1;
  await engine.handle({ matchId: id, kind: 'close_speed_window', dueAt: Date.now(), drawIndex });
  return true;
}

// Plays the match to its end with three screens, comparing them after every step.
async function playWatched(code: string): Promise<Screen[]> {
  const engine = kit.harness.built.match.engine;
  const id = (await kit.host.get(`/api/v1/matches/${code}`)).json<{ id: string }>().id;
  expect((await kit.player.post(`/api/v1/matches/${code}/join`, {})).statusCode).toBe(204);
  const screens = [
    await screen(kit.player, code),
    await screen(spectator, code),
    await screen(kit.host, code),
  ];
  await kit.host.post(`/api/v1/matches/${code}/bots`, { upTo: 8 });
  await sameAsFetch(screens, engine, id);
  await engine.start(id, 0);
  await engine.handle({ matchId: id, kind: 'start_match', dueAt: Date.now() });
  await sameAsFetch(screens, engine, id);
  for (let i = 0; i < 400 && (await nextStep(engine, id)); i += 1) {
    await sameAsFetch(screens, engine, id);
  }
  expect((await engine.runner.current(id)).record.status).toBe('finished');
  for (const s of screens) s.socket.disconnect();
  return screens;
}

// Every card a frame names, as `name` lists (round starts, the watched cards).
function cardHolders(frame: unknown): string[] {
  const names: string[] = [];
  const f = frame as Partial<LiveStepFrame & LiveOwnFrame>;
  for (const e of f.events ?? []) {
    if (e.event.type === 'roundStarted') {
      names.push(...Object.keys(e.event.cardsByPlayer));
      if (e.event.drawSequence.length > 0) names.push('<draw order>');
    }
  }
  if (f.watch !== undefined && f.watch !== null) names.push(...Object.keys(f.watch.cards));
  return names;
}

describe('live frames equal full fetches (06 §8)', () => {
  let royale: Screen[] = [];

  it('over a whole royale: lobby, stages, cuts, recaps, the final', async () => {
    const created = await kit.host.post('/api/v1/matches', {
      title: 'Frames royale',
      gameType: 'royale',
      drawMode: 'host',
      missedNumbers: { kind: 'noAutoMark' },
      maxPlayers: 10,
      roundPause: { kind: 'host' },
      testProfile: 'fast',
    });
    royale = await playWatched(created.json<{ code: string }>().code);
  }, 300_000);

  it('over a whole classic match', async () => {
    await playWatched(await kit.createMatch('host'));
  }, 300_000);

  it('never give a player still in another card, the draw order or a seed (D24)', () => {
    const [player, watcher] = royale;
    expect(player).toBeDefined();
    const me = player?.held?.me ?? '';
    // Until the player went out: the frames before the first own frame with watched cards.
    const frames = player?.frames ?? [];
    const out = frames.findIndex((f) => (f as Partial<LiveOwnFrame>).watch != null);
    const whileIn = out < 0 ? frames : frames.slice(0, out);
    expect(whileIn.length).toBeGreaterThan(10);
    for (const f of whileIn) {
      expect(cardHolders(f).filter((name) => name !== me)).toEqual([]);
      expect(JSON.stringify(f)).not.toMatch(/"seed"/);
    }
    // The spectator watches from the start: its own frames carry the watched cards.
    expect(watcher?.frames.some((f) => cardHolders(f).length > 0)).toBe(true);
  });
});
