/**
 * @file   apps/server/src/realtime/liveSteps.ts
 * @module server/realtime
 * @brief  One live update per step of a match: built once, sent to the room and each socket (06 §8).
 *
 * Responsibility: the events the engine publishes for a match wait up to 40 ms, so a draw, the
 *                 window close and a batch of taps that come together are one step; then, one
 *                 match at a time, the shared replay (../view/liveViews) is extended once with
 *                 those events (no read of the log), the room frame is built once and broadcast
 *                 to the match room (the summary and standings order left out when the room
 *                 already has them), and every socket in the room gets its own frame
 *                 (../view/stepFrames): the watched cards without a followed player are built
 *                 once for all watchers. Screens apply both without a state fetch. This runs on
 *                 a timer, never in the match's command queue: a tap is answered when its batch
 *                 is stored, not after the screens are updated. Per socket it keeps how much of
 *                 the viewer's effect timeline was sent and whom a watcher follows. In an
 *                 asynchronous match the accounts sent a step have seen it (./seenLive, D54).
 * Depends on:     socket.io (types), @sbr/application, ../view/liveViews, ../view/stepFrames,
 *                 ../view/watchView, ../http/routes/metrics (types), ./gateway (types), ./seenLive
 * Used by:        ./gateway, ./intents (follow)
 * Spec:           docs/spec/06-realtime-architecture.md §4, §8; docs/spec/12-testing-strategy.md §5
 */
import type { MatchEngine, StoredEvent } from '@sbr/application';
import type { WatchView } from '@sbr/contracts';
import type { Namespace, Socket } from 'socket.io';

import type { LiveMetrics } from '../http/routes/metrics.js';
import type { LiveViews } from '../view/liveViews.js';
import type { SeenLive } from './seenLive.js';
import { leaveOutUnchanged, ownFrame, roomFrame, type RoomSent } from '../view/stepFrames.js';
import { buildWatchView, NO_WATCH_QUERY } from '../view/watchView.js';
import type { SocketData } from './gateway.js';

// Events closer together than this go out as one step.
export const STEP_WINDOW_MS = 40;

// What one socket got of one match: its timeline's length, the player it follows (D24).
export interface SocketLive {
  status: number;
  follow: string | null;
}

interface LiveStepsDeps {
  readonly play: Namespace;
  readonly engine: MatchEngine;
  readonly views: LiveViews;
  readonly live?: LiveMetrics | undefined;
  // Asynchronous matches: the players sent a step have seen it (D54).
  readonly seen?: SeenLive | undefined;
}

export class LiveSteps {
  // Per match: the events waiting for their step, the seq the room has, the summary and
  // standings order it has, the step queue.
  private readonly waiting = new Map<string, StoredEvent[]>();
  private readonly sent = new Map<string, number>();
  private readonly roomSent = new Map<string, RoomSent>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly deps: LiveStepsDeps) {}

  published(matchId: string, events: readonly StoredEvent[]): void {
    const list = this.waiting.get(matchId);
    if (list !== undefined) {
      list.push(...events);
      return;
    }
    this.waiting.set(matchId, [...events]);
    if (!this.sent.has(matchId)) this.sent.set(matchId, (events[0]?.seq ?? 1) - 1);
    setTimeout(() => {
      const previous = this.queues.get(matchId) ?? Promise.resolve();
      const next = previous.then(() => this.step(matchId)).catch(() => undefined);
      this.queues.set(matchId, next);
    }, STEP_WINDOW_MS);
  }

  private async step(matchId: string): Promise<void> {
    const held = this.waiting.get(matchId) ?? [];
    this.waiting.delete(matchId);
    const m = await this.deps.engine.runner.current(matchId);
    const entry = await this.deps.views.entryFor(m, held);
    const recap = await this.deps.views.recapFor(m, entry);
    const since = this.sent.get(matchId) ?? 0;
    if (entry.replay.length <= since) return;
    const started = Date.now();
    const step = { match: m, entry, since, recap, clock: this.deps.engine.clockFacts(m) };
    const room = roomFrame(step);
    this.sent.set(matchId, room.s);
    const lean = leaveOutUnchanged(room, this.roomSent.get(matchId));
    this.roomSent.set(matchId, lean.sent);
    const name = `match:${matchId}`;
    this.deps.play.to(name).emit('events', lean.frame);
    let watchedTop: WatchView | undefined | null = null;
    const top = (): WatchView | undefined =>
      watchedTop === null
        ? (watchedTop = buildWatchView(m.state, entry.idMap, NO_WATCH_QUERY))
        : watchedTop;
    let bytes = 0;
    const watchers: string[] = [];
    for (const socket of this.socketsIn(name)) {
      const data = socket.data as SocketData;
      if (data.session.accountId !== null) watchers.push(data.session.accountId);
      const live = liveOf(data, matchId);
      const own = ownFrame({
        step,
        room,
        accountId: data.session.accountId,
        sentStatus: live.status,
        follow: live.follow,
        watchedTop: top,
      });
      live.status = own.sentStatus;
      socket.emit('own', own.frame);
      bytes += JSON.stringify(own.frame).length;
    }
    if (m.record.ruleset.mode === 'async') this.deps.seen?.record(matchId, watchers, room.s);
    const recipients = this.deps.play.adapter.rooms.get(name)?.size ?? 0;
    bytes += JSON.stringify(lean.frame).length * recipients;
    this.deps.live?.built('frame', Date.now() - started, bytes);
  }

  private socketsIn(room: string): Socket[] {
    const ids = this.deps.play.adapter.rooms.get(room) ?? new Set<string>();
    return [...ids].flatMap((id) => {
      const socket = this.deps.play.sockets.get(id);
      return socket === undefined ? [] : [socket];
    });
  }
}

// The socket's state for the match: a fresh one when it starts watching (match.watch).
export function liveOf(data: SocketData, matchId: string): SocketLive {
  let live = data.live.get(matchId);
  if (live === undefined) {
    live = { status: 0, follow: null };
    data.live.set(matchId, live);
  }
  return live;
}
