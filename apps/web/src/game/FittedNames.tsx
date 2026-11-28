/**
 * @file   apps/web/src/game/FittedNames.tsx
 * @module web/game
 * @brief  The cut's names in two lines, then "and N more" (owner decision of 2026-11-28).
 *
 * Responsibility: show the server's names of the players out (it sends up to eight) as many as
 *                 fit in two lines of the list's width, measured on the page, and count the rest
 *                 in "and N more" together with those the server did not name. Where nothing can
 *                 be measured every name shows. The viewer's own name is highlighted and kept in
 *                 sight. Display only.
 * Depends on:     react, ./labels
 * Used by:        ./InterludeCards
 * Spec:           docs/spec/01-game-design.md §7 (D20), §13; docs/concepts/fit-audit.md §12
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';

import { moreLine } from './labels.js';

interface FittedNamesProps {
  readonly names: readonly string[];
  // Everyone who is out, named or not.
  readonly total: number;
  readonly me: string | null;
}

export function FittedNames({ names, total, me }: FittedNamesProps): ReactElement {
  const list = useRef<HTMLUListElement>(null);
  const [count, setCount] = useState(names.length);
  // A new width, or other names: count from all of them again.
  const key = names.join(',');
  useEffect(() => {
    const all = (): void => {
      setCount(names.length);
    };
    all();
    window.addEventListener('resize', all);
    return () => {
      window.removeEventListener('resize', all);
    };
  }, [key, names.length]);
  // One name fewer while the list is higher than two of its lines and their gap.
  useLayoutEffect(() => {
    const el = list.current;
    const line = (el?.firstElementChild as HTMLElement | null | undefined)?.offsetHeight ?? 0;
    if (el === null || line === 0 || count <= 1) return;
    if (el.scrollHeight > 2.75 * line) setCount(count - 1);
  });
  // The viewer's own name stays among those shown.
  const own = me !== null && names.includes(me) ? names.indexOf(me) : -1;
  const shown =
    own >= count ? [...names.slice(0, count - 1), names[own] ?? ''] : names.slice(0, count);
  const more = total - shown.length;
  return (
    <ul ref={list} className="interlude-names" data-testid="recap-out">
      {shown.map((name) => (
        <li key={name} className={name === me ? 'is-own' : undefined}>
          {name}
        </li>
      ))}
      {more > 0 ? <li className="sbr-muted">{moreLine(more)}</li> : null}
    </ul>
  );
}
