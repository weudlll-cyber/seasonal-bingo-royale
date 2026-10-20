/**
 * @file   apps/web/src/components/OwnerStatusPanel.tsx
 * @module web
 * @brief  The owner's score, rank, active effects, shield charges, seasons (01 §8, §13).
 *
 * Responsibility: show what the server reports for one owner account: points and rank
 *                 in the standings, active effects with remaining draws (badges in the
 *                 colour of the season that grants them), Winter shield charges and
 *                 the four seasons with the collected ones highlighted.
 * Depends on:     react, ./SeasonIcon, ../types
 * Used by:        ./Playback
 * Spec:           docs/spec/01-game-design.md §8.2, §13; docs/spec/15-implementation-plan.md WP-08
 */
import type { ReactElement } from 'react';

import { SeasonIcon } from './SeasonIcon.js';
import {
  ON_SEASON_COLOR,
  SEASON_COLORS,
  SEASON_NAMES,
  type EffectKind,
  type OwnerStatus,
  type Season,
} from '../types.js';

export interface OwnerStatusPanelProps {
  readonly accountId: string;
  readonly points: number;
  readonly rank: number;
  readonly status: OwnerStatus | null;
  readonly effectSeasons: Readonly<Partial<Record<EffectKind, Season>>>;
}

export function OwnerStatusPanel(props: OwnerStatusPanelProps): ReactElement {
  const { accountId, points, rank, status, effectSeasons } = props;
  const collected = new Set(status?.seasons ?? []);
  return (
    <section data-testid={`owner-status-${accountId}`} aria-label={`${accountId} status`}>
      <p style={{ margin: 0 }}>
        <strong>{accountId}</strong> · {String(points)} pts · rank #{String(rank)}
      </p>
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', margin: '0.3rem 0' }}>
        {status?.multiplier ? (
          <EffectBadge season={effectSeasons.multiplier} testId="effect-multiplier">
            ×{String(status.multiplier.factor)} · {String(status.multiplier.remainingDraws)} draws
            left
          </EffectBadge>
        ) : null}
        {status?.growth ? (
          <EffectBadge season={effectSeasons.growth} testId="effect-growth">
            growth +{String(status.growth.pointsPerMark)}/mark ·{' '}
            {String(status.growth.remainingDraws)} draws left
          </EffectBadge>
        ) : null}
        <EffectBadge season={effectSeasons.shield} testId="effect-shield">
          shield ×{String(status?.shieldCharges ?? 0)}
        </EffectBadge>
      </div>
      <p style={{ margin: 0 }} data-testid="seasons-collected">
        Seasons collected: {String(collected.size)}/4{' '}
        {SEASON_NAMES.map((s) => (
          <SeasonIcon key={s} season={s} size="1.2rem" onColor dimmed={!collected.has(s)} />
        ))}
      </p>
    </section>
  );
}

interface BadgeProps {
  readonly season: Season | undefined;
  readonly testId: string;
  readonly children: React.ReactNode;
}

function EffectBadge({ season, testId, children }: BadgeProps): ReactElement {
  return (
    <span
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.1rem 0.45rem',
        borderRadius: '999px',
        background: season === undefined ? '#2a3645' : SEASON_COLORS[season],
        color: season === undefined ? '#e7ecf3' : ON_SEASON_COLOR,
        fontSize: '0.85rem',
      }}
    >
      {season === undefined ? null : <SeasonIcon season={season} size="0.9rem" />}
      {children}
    </span>
  );
}
