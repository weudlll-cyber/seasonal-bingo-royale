/**
 * @file   apps/web/src/components/OwnerStatusPanel.tsx
 * @module web
 * @brief  The owner's score, rank, active effects, shield and seasons in plain words (01 §8, §13).
 *
 * Responsibility: what the server reports for one owner account: points and rank; each active
 *                 effect as one sentence with the season's name, ruleset numbers and server status
 *                 ("Summer boost: your marks and speed bonus count x1.5 - 5 more numbers"), the
 *                 Winter shield with margin and charges, each shield save with the cut and
 *                 distance below the line; the four seasons by name with collected ones ticked and
 *                 lit, what all four give, that seasons count over the whole match. Icons and
 *                 colours stay beside the words; lines wrap, never truncate. Never from local
 *                 taps. Once eliminated: "Out in cut N" instead. Short (the wide match
 *                 screens, owner decision of 2026-11-28): the running effects in a few words,
 *                 the four season marks on one line with what all four give; at the end no
 *                 effect and no shield.
 * Depends on:     react, ./SeasonIcon, ../game/seasonText, ../playbackTypes, ../types
 * Used by:        ./OwnerArea
 * Spec:           docs/spec/01-game-design.md §8.2, §8.3, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { Fragment, type ReactElement, type ReactNode } from 'react';

import { SEASON_MARK_SIZE, SeasonIcon } from './SeasonIcon.js';
import {
  boostSentence,
  boostShort,
  growthSentence,
  growthShort,
  shieldShort,
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
  // The short form, and whether the match is over (no effect runs any more).
  readonly short?: boolean;
  readonly over?: boolean;
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
      // Scrolls where the column is short: a tab stop, so a keyboard can reach it (WCAG 2.1.1).
      tabIndex={0}
    >
      <p className="owner-status-head">
        <strong>{accountId}</strong> · {String(points)} pts · rank #{String(rank)}
      </p>
      {props.outInCut !== null ? (
        <p className="status-out" data-testid="owner-out">
          Out in cut {String(props.outInCut)}
        </p>
      ) : null}
      {props.showSeasons && props.outInCut === null && !props.short ? (
        <SeasonStatus {...props} />
      ) : null}
      {props.showSeasons && props.short ? <ShortSeasons {...props} /> : null}
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

// The running effects in a few words, then the season marks and "+300" on one line.
function ShortSeasons(props: OwnerStatusPanelProps): ReactElement {
  const running = props.outInCut === null && props.over !== true;
  const collected = new Set(props.status?.seasons ?? []);
  return (
    <>
      {running ? <ShortEffects {...props} /> : null}
      <p className="season-marks" data-testid="seasons-collected" data-count={collected.size}>
        {SEASON_NAMES.map((s) => (
          <span key={s} className="season-item">
            <SeasonIcon season={s} size={SEASON_MARK_SIZE} onColor earned={collected.has(s)} />
            <span className="sk-visually-hidden">
              {seasonName(s)}
              {collected.has(s) ? ' ✓' : ''}
            </span>
          </span>
        ))}
        <span>+{props.rules.seasonCompletePoints}</span>
      </p>
    </>
  );
}

function ShortEffects({ status, rules }: OwnerStatusPanelProps): ReactElement {
  const { multiplier: boost, growth: grow, shield } = rules.effectSeasons;
  const charges = status?.shieldCharges ?? 0;
  return (
    <>
      {status?.multiplier && boost !== undefined ? (
        <EffectLine season={boost} testId="effect-multiplier">
          {boostShort(boost, status.multiplier.factor, status.multiplier.remainingDraws)}
        </EffectLine>
      ) : null}
      {status?.growth && grow !== undefined ? (
        <EffectLine season={grow} testId="effect-growth">
          {growthShort(grow, status.growth.remainingDraws)}
        </EffectLine>
      ) : null}
      {shield !== undefined && charges > 0 ? (
        <EffectLine season={shield} testId="effect-shield">
          {shieldShort(shield, charges)}
        </EffectLine>
      ) : null}
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
        {/* The separator outside the unbreakable item: the line wraps between seasons. */}
        {SEASON_NAMES.map((s, i) => (
          <Fragment key={s}>
            {i > 0 ? ' · ' : ''}
            <span className="season-item">
              <SeasonIcon season={s} size={SEASON_MARK_SIZE} onColor earned={collected.has(s)} />
              {/* A collected season is ticked; an open one is its name alone. */}
              {seasonName(s)}
              {collected.has(s) ? ' ✓' : ''}
            </span>
          </Fragment>
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
