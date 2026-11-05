/**
 * @file   apps/web/src/components/StepBadges.tsx
 * @module web
 * @brief  A member's Discord steps next to their name, as on the website (2026-11-04).
 *
 * Responsibility: up to three small badges (holder, farmer, investor; each the highest step)
 *                 with the step's icon and its name for screen readers and as a tooltip. The
 *                 icon is the site-relative path the server checked (one leading "/"), so it
 *                 loads from the website's own origin, never from an absolute URL. A match
 *                 screen provides its players' steps by name (StepsByName), so every ranked row
 *                 shows them; the leaderboard, the profile and the waiting room pass them on.
 *                 Nothing shows in standalone installs (no steps exist there).
 * Depends on:     react, ../types, ./results.css
 * Used by:        ./RankRow, ../game/MatchScreen, ../game/WaitingRoom, ../league/LeaderboardPage,
 *                 ../league/ProfilePage
 * Spec:           docs/spec/07-integration-architecture.md §2.3
 */
import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

import type { PlayerSummary, Step } from '../types.js';
import './results.css';

const LADDER_NAMES: Readonly<Record<Step['ladder'], string>> = {
  holder: 'Holder',
  farmer: 'Farmer',
  investor: 'Investor',
};

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
  const steps = useContext(StepsContext).get(name);
  return steps === undefined ? null : <StepBadges steps={steps} />;
}

export function StepBadges({
  steps,
}: {
  readonly steps: readonly Step[] | undefined;
}): ReactElement | null {
  if (steps === undefined || steps.length === 0) return null;
  return (
    <span className="step-badges" data-testid="step-badges">
      {steps.map((s) => {
        const label = `${LADDER_NAMES[s.ladder]}: ${s.name}`;
        return (
          <span key={s.ladder} className="step-badge" title={label}>
            {s.icon === null ? null : (
              <img src={s.icon} alt="" width={16} height={16} loading="lazy" />
            )}
            <span className="sbr-visually-hidden">{label}</span>
          </span>
        );
      })}
    </span>
  );
}
