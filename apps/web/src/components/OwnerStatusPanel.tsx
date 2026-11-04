/**
 * @file   apps/web/src/components/OwnerStatusPanel.tsx
 * @module web
 * @brief  The owner's score, rank, active effects, shield and seasons in plain words (01 §8, §13).
 *
 * Responsibility: show what the server reports for one owner account: points and rank in the
 *                 standings; each active effect as one sentence with the season's name and the
 *                 numbers of the ruleset and the server's status ("Summer boost: your marks and
 *                 speed bonus count ×1.5 — 5 more numbers"), the Winter shield with its margin and charges
 *                 while it has one, each shield save with the cut and how far below the line the
 *                 owner was; the four seasons of the match by name with the collected ones ticked
 *                 and lit, what all four give, and that seasons count over the whole match. The
 *                 icons and season colours stay beside the words; lines wrap, never truncate.
 *                 Never from local taps. Once eliminated: "Out in cut N" instead.
 * Depends on:     react, ./SeasonIcon, ../game/seasonText, ../playbackTypes, ../types
 * Used by:        ./OwnerArea
 * Spec:           docs/spec/01-game-design.md §8.2, §8.3, §13; docs/spec/15-implementation-plan.md WP-08
 */
import type { ReactElement, ReactNode } from 'react';

import { SeasonIcon } from './SeasonIcon.js';
import {
  boostSentence,
  growthSentence,
  seasonCompleteNote,
  seasonName,
  shieldSavedLine,
  shieldSentence,
} from '../game/seasonText.js';
import type { ShieldSave } from '../playbackTypes.js';
import {
  seasonColor,
  SEASON_NAMES,
  type OwnerStatus,
  type QuickTestResult,
  type Season,
} from '../types.js';

// The ruleset facts the sentences name (from the server's view).
type StatusRules = Pick<
  QuickTestResult,
  'effectSeasons' | 'seasonEffects' | 'seasonCompletePoints'
>;

interface OwnerStatusPanelProps {
  readonly accountId: string;
  readonly points: number;
  readonly rank: number;
  readonly status: OwnerStatus | null;
  readonly rules: StatusRules;
  // Effects, shield and seasons exist in royale only (01 §3a).
  readonly showSeasons: boolean;
  // The cut that eliminated the owner, null while in: an eliminated owner has no effect
  // or shield left, so the panel says "Out in cut N" instead.
  readonly outInCut: number | null;
  readonly shieldSaves: readonly ShieldSave[];
}

export function OwnerStatusPanel(props: OwnerStatusPanelProps): ReactElement {
  const { accountId, points, rank } = props;
  return (
    <section
      className="owner-status"
      data-testid={`owner-status-${accountId}`}
      data-points={points}
      data-rank={rank}
      aria-label={`${accountId} status`}
    >
      <p className="owner-status-head">
        <strong>{accountId}</strong> · {String(points)} pts · rank #{String(rank)}
      </p>
      {props.outInCut !== null ? (
        <p className="status-out" data-testid="owner-out">
          Out in cut {String(props.outInCut)}
        </p>
      ) : null}
      {props.showSeasons && props.outInCut === null ? <SeasonStatus {...props} /> : null}
    </section>
  );
}

function SeasonStatus({ status, rules, shieldSaves }: OwnerStatusPanelProps): ReactElement {
  const { multiplier: boost, growth: grow } = rules.effectSeasons;
  return (
    <>
      {status?.multiplier && boost !== undefined ? (
        <EffectLine season={boost} testId="effect-multiplier">
          {boostSentence(boost, status.multiplier.factor, status.multiplier.remainingDraws)}
        </EffectLine>
      ) : null}
      {status?.growth && grow !== undefined ? (
        <EffectLine season={grow} testId="effect-growth">
          {growthSentence(grow, status.growth.remainingDraws)}
        </EffectLine>
      ) : null}
      <Shield rules={rules} charges={status?.shieldCharges ?? 0} saves={shieldSaves} />
      <Seasons collected={new Set(status?.seasons ?? [])} points={rules.seasonCompletePoints} />
    </>
  );
}

// The Winter shield while it has a charge, and every save it made (cut, places below).
function Shield({
  rules,
  charges,
  saves,
}: {
  readonly rules: StatusRules;
  readonly charges: number;
  readonly saves: readonly ShieldSave[];
}): ReactElement {
  const season = rules.effectSeasons.shield;
  const effect = season === undefined ? undefined : rules.seasonEffects[season];
  return (
    <>
      {season !== undefined && effect?.type === 'shield' && charges > 0 ? (
        <EffectLine season={season} testId="effect-shield">
          {shieldSentence(season, effect.rankMargin, charges)}
        </EffectLine>
      ) : null}
      {saves.map((s) => (
        <p key={s.cut} className="effect-line" data-testid="shield-saved">
          {shieldSavedLine(s.cut, s.placesBelow)}
        </p>
      ))}
    </>
  );
}

// "Seasons this match: Spring ✓ · Summer ✓ · Autumn · Winter ✓ — all four give +300".
function Seasons({
  collected,
  points,
}: {
  readonly collected: ReadonlySet<Season>;
  readonly points: number;
}): ReactElement {
  return (
    <>
      <p className="season-list" data-testid="seasons-collected" data-count={collected.size}>
        Seasons this match:{' '}
        {SEASON_NAMES.map((s, i) => (
          <span key={s} className="season-item">
            {i > 0 ? ' · ' : ''}
            <SeasonIcon season={s} size="1.1rem" onColor dimmed={!collected.has(s)} />
            {/* A collected season is ticked; an open one is its name alone. */}
            {seasonName(s)}
            {collected.has(s) ? ' ✓' : ''}
          </span>
        ))}{' '}
        — {seasonCompleteNote(points)}
      </p>
      <p className="sbr-muted season-note" data-testid="seasons-note">
        Seasons count over the whole match.
      </p>
    </>
  );
}

interface LineProps {
  readonly season: Season;
  readonly testId: string;
  readonly children: ReactNode;
}

// One effect sentence with its season icon, framed in the season colour.
function EffectLine({ season, testId, children }: LineProps): ReactElement {
  return (
    <p className="effect-line" data-testid={testId} style={{ borderColor: seasonColor(season) }}>
      <SeasonIcon season={season} size="1rem" onColor />
      {children}
    </p>
  );
}
