/**
 * @file   apps/web/src/components/StepBadges.tsx
 * @module web
 * @brief  A member's Discord steps by shown name, for the rows of a match screen (2026-11-04).
 *
 * Responsibility: a match screen provides its players' steps by name (`StepsByName`), so a row
 *                 that knows only a name can show them (`NameSteps`). The badges themselves are
 *                 the kit's `StepBadges` (K68): the step's icon from the website's own origin,
 *                 named by the step; one without such an icon is left out. The leaderboard and
 *                 the profile pass a player's steps to the kit's part directly. Nothing shows in
 *                 standalone installs (no steps exist there).
 * Depends on:     react, @seasonal/kit/react (StepBadges), ../types
 * Used by:        ./RankRow, ../game/MatchScreen, ../game/WaitingRoom
 * Spec:           docs/spec/07-integration-architecture.md §2.3
 */
import { StepBadges } from '@seasonal/kit/react';
import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

import type { PlayerSummary, Step } from '../types.js';

const StepsContext = createContext<ReadonlyMap<string, readonly Step[]>>(new Map());

// The match's players' steps by shown name, for every row below.
export function StepsByName(props: {
  readonly players: readonly PlayerSummary[];
  readonly children: ReactNode;
}): ReactElement {
  const byName = new Map(props.players.flatMap((p) => (p.steps ? [[p.accountId, p.steps]] : [])));
  return <StepsContext.Provider value={byName}>{props.children}</StepsContext.Provider>;
}

// The steps of a shown name on a match screen, or nothing.
export function NameSteps({ name }: { readonly name: string }): ReactElement | null {
  return <StepBadges steps={useContext(StepsContext).get(name)} />;
}
