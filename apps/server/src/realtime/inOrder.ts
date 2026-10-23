/**
 * @file   apps/server/src/realtime/inOrder.ts
 * @module server/realtime
 * @brief  Runs async calls one after another in arrival order (per socket intents, 06 §4.1).
 *
 * Responsibility: wrap an async handler so a later call starts only after the earlier one
 *                 has finished, whatever their durations. The gateway uses one per socket,
 *                 so an unwatch followed at once by a watch cannot leave the room after
 *                 joining it (found by the real-game play-through).
 * Depends on:     nothing
 * Used by:        ./gateway
 * Spec:           docs/spec/06-realtime-architecture.md §4.1
 */

export function inOrder<A extends unknown[]>(
  handler: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
  let queue: Promise<void> = Promise.resolve();
  return (...args: A) => {
    queue = queue.then(() => handler(...args)).catch(() => undefined);
    return queue;
  };
}
