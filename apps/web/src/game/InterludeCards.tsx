/**
 * @file   apps/web/src/game/InterludeCards.tsx
 * @module web/game
 * @brief  The body of one recap card in the interlude between royale rounds (D20).
 *
 * Responsibility: what each card shows of the server's recap: the top three on the podium
 *                 with their points in the round; the biggest climber as a standings row
 *                 ("up from #6 to #2"); the cut — how many are out, up to eight names and
 *                 "and N more", the Winter shield's saves; Season Complete with the four
 *                 season icons and the fastest tapper; the round's facts. The viewer's own
 *                 name is highlighted. Texts come from ./labels; nothing is computed here.
 * Depends on:     react, @sbr/contracts (types), ../components/Podium, ../components/RankRow,
 *                 ../components/SeasonIcon, ../types, ./labels
 * Used by:        ./Interlude
 * Spec:           docs/spec/01-game-design.md §7 (D20), §13
 */
import type { RoundRecap } from '@sbr/contracts';
import type { ReactElement } from 'react';

import { Podium } from '../components/Podium.js';
import { RankRow } from '../components/RankRow.js';
import { SeasonIcon } from '../components/SeasonIcon.js';
import { SEASON_NAMES } from '../types.js';
import {
  climberLine,
  cutOutLine,
  factsLine,
  fastestLine,
  moreLine,
  nameList,
  seasonCompleteLine,
  shieldSavedLine,
  type RecapCard,
} from './labels.js';

interface CardProps {
  readonly recap: RoundRecap;
  // The viewer's name as the recap writes it; null for the host and spectators.
  readonly me: string | null;
}

export function RecapCardBody({ card, ...props }: CardProps & { readonly card: RecapCard }) {
  switch (card) {
    case 'top':
      return <TopCard {...props} />;
    case 'climber':
      return <ClimberCard {...props} />;
    case 'cut':
      return <CutCard {...props} />;
    case 'seasons':
      return <SeasonsCard {...props} />;
    case 'facts':
      return (
        <p className="interlude-facts">
          {factsLine(props.recap.facts.numbersDrawn, props.recap.facts.playersLeft)}
        </p>
      );
  }
}

function TopCard({ recap, me }: CardProps): ReactElement {
  const entries = (recap.top ?? []).map((s, i) => ({
    place: i + 1,
    name: s.name,
    note: `${String(s.points)} pts`,
    own: s.name === me,
    attrs: { 'data-testid': `recap-top-${String(i + 1)}`, 'data-points': s.points },
  }));
  return <Podium entries={entries} />;
}

function ClimberCard({ recap, me }: CardProps): ReactElement | null {
  const c = recap.climber;
  if (c === undefined) return null;
  return (
    <ol className="rank-list">
      <RankRow
        rank={c.to}
        name={c.name}
        note={climberLine(c.from, c.to)}
        seasons={null}
        own={c.name === me}
        out={false}
        attrs={{ 'data-testid': 'recap-climber' }}
      />
    </ol>
  );
}

function CutCard({ recap, me }: CardProps): ReactElement | null {
  const cut = recap.cut;
  if (cut === undefined) return null;
  const more = cut.outCount - cut.out.length;
  return (
    <div className="sbr-stack">
      {cut.outCount > 0 ? <p className="interlude-lead">{cutOutLine(cut.outCount)}</p> : null}
      {cut.out.length > 0 ? (
        <ul className="interlude-names" data-testid="recap-out">
          {cut.out.map((name) => (
            <li key={name} className={name === me ? 'is-own' : undefined}>
              {name}
            </li>
          ))}
          {more > 0 ? <li className="sbr-muted">{moreLine(more)}</li> : null}
        </ul>
      ) : null}
      {cut.saved.length > 0 ? (
        <p data-testid="recap-saved">
          <SeasonIcon season="winter" size="1.1rem" onColor /> {shieldSavedLine(cut.saved)}
        </p>
      ) : null}
    </div>
  );
}

function SeasonsCard({ recap }: CardProps): ReactElement {
  const fastest = recap.fastest;
  return (
    <div className="sbr-stack">
      {recap.seasonComplete === undefined ? null : (
        // One line however many completed them, the four season icons once.
        <p data-testid="recap-season-complete">
          <span className="interlude-seasons" aria-hidden="true">
            {SEASON_NAMES.map((s) => (
              <SeasonIcon key={s} season={s} size="1.1rem" onColor />
            ))}
          </span>{' '}
          {seasonCompleteLine(nameList(recap.seasonComplete))}
        </p>
      )}
      {fastest === undefined ? null : (
        <p data-testid="recap-fastest">
          {fastestLine(fastest.name, fastest.averageMs, fastest.taps)}
        </p>
      )}
    </div>
  );
}
