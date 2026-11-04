/**
 * @file   apps/server/src/view/stepFrames.ts
 * @module server/view
 * @brief  The live frames of one step of a match: the room's once, each socket's own (06 §4, §8).
 *
 * Responsibility: from the match, its shared replay (./liveViews) and the seq the room last got,
 *                 the room frame: the new events with round starts stripped of cards and draw
 *                 order (./clientEvents liveEvent), the summary without `youHost`, the players
 *                 still in in the server's order, the recap of the pause or null, and the stage
 *                 baselines, cut facts and player list (no cards) only when the step changes
 *                 them — the same values a state fetch would carry (../http/routes/matchViews);
 *                 `leaveOutUnchanged` drops the summary and the order of the players still in
 *                 when they equal what the room last got.
 *                 Per socket: who the viewer plays as, their effect timeline after what this
 *                 socket already got, their own cards of the step's round starts, their
 *                 first-round card with the player list, and the watched cards when they watch
 *                 (a player out or a spectator, D24). Display data only; nothing secret.
 * Depends on:     @sbr/application (types), @sbr/contracts (types), @sbr/domain (types),
 *                 ../http/routes/matchViews, ./clientEvents, ./clientView, ./liveViews (types),
 *                 ./watchView
 * Used by:        ../realtime/liveSteps, ./stepFrames.test, test/liveSteps.integration.test.ts
 * Spec:           docs/spec/06-realtime-architecture.md §4, §8; docs/spec/01-game-design.md §9, §13
 */
import type { ClockFacts, LoadedMatch } from '@sbr/application';
import type { LiveOwnFrame, LiveStepFrame, RoundRecap, WatchView } from '@sbr/contracts';

import { changesPlayers, matchSummary, viewerView } from '../http/routes/matchViews.js';
import { liveEvent } from './clientEvents.js';
import { EMPTY_CARD } from './clientView.js';
import type { LiveEntry } from './liveViews.js';
import { buildWatchView, rankedIn, watches, type WatchQuery } from './watchView.js';

interface StepInput {
  readonly match: LoadedMatch;
  readonly entry: LiveEntry;
  // The room has every event up to this seq; the step carries those after it.
  readonly since: number;
  readonly recap: RoundRecap | null;
  readonly clock: ClockFacts;
}

export function roomFrame(input: StepInput): LiveStepFrame {
  const { match: m, entry, since } = input;
  const { idMap, replay } = entry;
  const events = replay.renamed.slice(since).map((event, i) => ({
    s: since + i + 1,
    at: entry.timed[since + i]?.at ?? 0,
    event: liveEvent(event, null),
  }));
  const types = new Set(events.map((e) => e.event.type));
  const players = events.some((e) => changesPlayers(e.event))
    ? viewerView(m, entry, null).players
    : undefined;
  return {
    s: replay.length,
    since,
    events,
    match: matchSummary(m, null, input.clock),
    view: {
      rankedIn: rankedIn(m.state).map((id) => idMap.get(id) ?? id),
      recaps: input.recap === null ? null : [input.recap],
      ...(types.has('stageStarted') ? { stagePoints: replay.stagePoints } : {}),
      ...(types.has('cutApplied') ? { cuts: replay.cuts } : {}),
      ...(players === undefined ? {} : { players }),
    },
  };
}

// What the room last got of the parts a frame leaves out when unchanged, as JSON.
export interface RoomSent {
  readonly match: string;
  readonly rankedIn: string;
}

// The room frame without the summary and the standings order when they equal what the room
// last got (a screen keeps what it holds, @sbr/contracts applyStep); what it got afterwards.
export function leaveOutUnchanged<S>(
  full: LiveStepFrame<S>,
  last: RoomSent | undefined,
): { frame: LiveStepFrame<S>; sent: RoomSent } {
  const sent = { match: JSON.stringify(full.match), rankedIn: JSON.stringify(full.view.rankedIn) };
  const { match, view, ...rest } = full;
  const { rankedIn, ...kept } = view;
  const frame: LiveStepFrame<S> = {
    ...rest,
    ...(sent.match === last?.match ? {} : { match }),
    view: { ...kept, ...(sent.rankedIn === last?.rankedIn ? {} : { rankedIn }) },
  };
  return { frame, sent };
}

interface OwnInput {
  readonly step: StepInput;
  readonly room: LiveStepFrame;
  // The socket's account (null for a guest), how much of its timeline it got, whom it follows.
  readonly accountId: string | null;
  readonly sentStatus: number;
  readonly follow: string | null;
  // The watched cards without a followed player, built once per step for every watcher.
  readonly watchedTop: () => WatchView | undefined;
}

// The viewer as a player of the match (account id and display name), or null.
function playerOf(m: LoadedMatch, entry: LiveEntry, id: string | null) {
  if (id === null || m.state.players[id] === undefined) return null;
  return { id, name: entry.idMap.get(id) ?? id };
}

// The parts of a player's own frame: the timeline after what was sent, own cards, first card.
function playerParts(input: OwnInput, player: { id: string; name: string }) {
  const { replay } = input.step.entry;
  const timeline = replay.ownerStatus[player.name] ?? [];
  const from = Math.min(input.sentStatus, timeline.length);
  const cards = ownCards(input.room, replay.renamed, player.name);
  const parts: Partial<LiveOwnFrame> = {
    status: { from, entries: timeline.slice(from) },
    ...(Object.keys(cards).length === 0 ? {} : { cards }),
    ...(input.room.view.players === undefined
      ? {}
      : { card: replay.firstCards.get(player.id) ?? EMPTY_CARD }),
  };
  return { parts, sent: timeline.length };
}

// The socket's own frame and how much of the viewer's timeline it holds afterwards.
export function ownFrame(input: OwnInput): { frame: LiveOwnFrame; sentStatus: number } {
  const { match: m, entry } = input.step;
  const player = playerOf(m, entry, input.accountId);
  const own = player === null ? { parts: {}, sent: 0 } : playerParts(input, player);
  const watch = watches(m.state, input.accountId) ? watchedBy(input, m, entry.idMap) : null;
  const frame: LiveOwnFrame = { s: input.room.s, me: player?.name ?? null, ...own.parts, watch };
  return { frame, sentStatus: own.sent };
}

// The viewer's own cards of the round starts in the step, by the event's seq.
function ownCards(
  room: LiveStepFrame,
  renamed: LiveEntry['replay']['renamed'],
  me: string,
): Record<string, NonNullable<LiveOwnFrame['cards']>[string]> {
  const cards: Record<string, NonNullable<LiveOwnFrame['cards']>[string]> = {};
  for (const { s } of room.events) {
    const event = renamed[s - 1];
    const own = event?.type === 'roundStarted' ? event.cardsByPlayer[me] : undefined;
    if (own !== undefined) cards[String(s)] = own;
  }
  return cards;
}

function watchedBy(input: OwnInput, m: LoadedMatch, idMap: LiveEntry['idMap']): WatchView | null {
  if (input.follow === null) return input.watchedTop() ?? null;
  const query: WatchQuery = { follow: input.follow, knownRound: null, known: [] };
  return buildWatchView(m.state, idMap, query) ?? null;
}
