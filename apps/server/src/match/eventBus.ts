/**
 * @file   apps/server/src/match/eventBus.ts
 * @module server/match
 * @brief  In-process event bus: committed match events to subscribers (02 §3, 06 §5).
 *
 * Responsibility: the engine publishes every committed batch; the WebSocket gateway
 *                 subscribes and fans it out to the match room. One process for now; the
 *                 Redis pub/sub adapter is the scale-out step (06 §9).
 * Depends on:     @sbr/application (types)
 * Used by:        ../realtime/gateway, ./runtime
 * Spec:           docs/spec/02-software-architecture.md §3; docs/spec/06-realtime-architecture.md §5, §9
 */
import { EventEmitter } from 'node:events';

import type { MatchEventBus, MatchRecord, StoredEvent } from '@sbr/application';

type MatchEventListener = (matchId: string, events: readonly StoredEvent[]) => void;
type MatchChangeListener = (record: MatchRecord) => void;

export class LocalEventBus implements MatchEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Every connected socket subscribes through the gateway, not per socket.
    this.emitter.setMaxListeners(100);
  }

  publish(matchId: string, events: readonly StoredEvent[]): void {
    this.emitter.emit('events', matchId, events);
  }

  changed(record: MatchRecord): void {
    this.emitter.emit('changed', record);
  }

  onChanged(listener: MatchChangeListener): () => void {
    this.emitter.on('changed', listener);
    return () => {
      this.emitter.off('changed', listener);
    };
  }

  subscribe(listener: MatchEventListener): () => void {
    this.emitter.on('events', listener);
    return () => {
      this.emitter.off('events', listener);
    };
  }
}
