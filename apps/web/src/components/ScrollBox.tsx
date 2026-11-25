/**
 * @file   apps/web/src/components/ScrollBox.tsx
 * @module web
 * @brief  A box that may scroll and says so: "More below" while its content continues.
 *
 * Responsibility: an element (`as`: div, section or aside) with the attributes it is given,
 *                 marked by ../useScrollHint so ../scrollHint.css draws the sign at its bottom
 *                 edge. Where such a box is a scroll stop it still names itself and takes a tab
 *                 stop from its caller (WCAG 2.1.1, ./scrollRegions.test).
 * Depends on:     react, ../useScrollHint
 * Used by:        ../game/MatchScreen, ../host/HostConsole
 * Spec:           docs/concepts/fit-audit.md §8
 */
import { useRef, type ComponentPropsWithoutRef, type ReactElement } from 'react';

import { useScrollHint } from '../useScrollHint.js';

type Props = ComponentPropsWithoutRef<'div'> & { readonly as?: 'div' | 'section' | 'aside' };

export function ScrollBox({ as: Tag = 'div', ...props }: Props): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  useScrollHint(box);
  return <Tag {...props} ref={box} />;
}
