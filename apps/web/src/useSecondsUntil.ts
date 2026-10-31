/**
 * @file   apps/web/src/useSecondsUntil.ts
 * @module web
 * @brief  Whole seconds left until a server time, updated four times a second.
 *
 * Responsibility: count down to a moment the server announced (the match start, the next
 *                 round after a cut): whole seconds, rounded up, never below 0; null when
 *                 no moment is known. Display only; the server starts rounds on its own.
 * Depends on:     react
 * Used by:        ./game/WaitingRoom, ./game/Registration, ./game/Interlude,
 *                 ./components/CutScreen, ./host/HostDrawControls
 * Spec:           docs/spec/01-game-design.md §7, §13
 */
import { useEffect, useState } from 'react';

export function useSecondsUntil(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, [at]);
  return at === null ? null : Math.max(0, Math.ceil((at - now) / 1000));
}
