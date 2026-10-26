/**
 * @file   packages/application/src/match/matchRules.test.ts
 * @module application/match
 * @brief  The rules the engine enforces around a match: prizes, joining, starting, tapping.
 *
 * Responsibility: a classic match needs at least one known prize (01 §3a.1); classicSeasons
 *                 starts from its own default ruleset; joining works only in the lobby, a
 *                 second join changes nothing and a full lobby refuses; Start, the automatic
 *                 start switch and "next round" are refused outside their moment; a tap on
 *                 the free centre or on an undrawn number marks nothing (12 §6); an unknown
 *                 match is reported as such.
 * Depends on:     vitest, ./engine, ./fakes, ./runner
 * Spec:           docs/spec/01-game-design.md §3a.1, §6, §7.1, §7.6; docs/spec/12-testing-strategy.md §6
 */
import { describe, expect, it } from 'vitest';

import { MatchError } from './engine.js';
import { fakeEngine } from './fakes.js';
import { MatchNotFound } from './runner.js';

const base = {
  title: 't',
  drawMode: 'host' as const,
  missedNumbers: { kind: 'noAutoMark' as const },
  maxPlayers: 3,
};

async function runningClassic() {
  const kit = fakeEngine();
  const m = await kit.engine.create({ ...base, gameType: 'classic' }, null);
  await kit.engine.join(m.id, 'person', true);
  await kit.engine.fillWithBots(m.id, 3);
  await kit.engine.start(m.id, 0);
  await kit.scheduler.runUntil(kit.engine, kit.clock, kit.clock.t);
  return { ...kit, id: m.id };
}

describe('prizes (01 §3a.1)', () => {
  it('refuses a classic match without a prize or with an unknown one', async () => {
    const { engine } = fakeEngine();
    const invalid = new MatchError('INVALID_PRIZES');
    await expect(engine.create({ ...base, gameType: 'classic', prizes: [] }, null)).rejects.toEqual(
      invalid,
    );
    await expect(
      engine.create({ ...base, gameType: 'classic', prizes: ['fullCard', 'rows-9'] }, null),
    ).rejects.toEqual(invalid);
  });

  it('starts classicSeasons from its own default ruleset and prizes', async () => {
    const { engine, store } = fakeEngine();
    const m = await engine.create({ ...base, gameType: 'classicSeasons' }, null);
    const record = store.records.get(m.id);
    expect(record?.rulesetName).toMatch(/classic-seasons|classicSeasons/i);
    expect(record?.prizes.length).toBeGreaterThan(0);
  });
});

describe('joining and starting (01 §7.6)', () => {
  it('joins once, refuses a full lobby and a started match', async () => {
    const { engine, store } = fakeEngine();
    const m = await engine.create({ ...base, gameType: 'classic', maxPlayers: 2 }, null);
    await engine.join(m.id, 'ann', true);
    await engine.join(m.id, 'ann', true);
    expect((await engine.runner.current(m.id)).state.playerOrder).toEqual(['ann']);
    await engine.join(m.id, 'bob', true);
    await expect(engine.join(m.id, 'cid', true)).rejects.toEqual(new MatchError('MATCH_FULL'));
    await engine.abort(m.id, 'done', 'host');
    expect(store.records.get(m.id)?.status).toBe('aborted');
    await expect(engine.join(m.id, 'dan', true)).rejects.toEqual(
      new MatchError('MATCH_NOT_IN_LOBBY'),
    );
  });

  it('refuses Start, the automatic start switch and "next round" outside their moment', async () => {
    const t = await runningClassic();
    await expect(t.engine.start(t.id, 0)).rejects.toEqual(new MatchError('MATCH_NOT_IN_LOBBY'));
    await expect(t.engine.startNextRound(t.id)).rejects.toEqual(
      new MatchError('NOT_WAITING_FOR_HOST'),
    );
    const { engine } = fakeEngine();
    const host = await engine.create({ ...base, gameType: 'classic' }, null);
    await expect(engine.setAutoStart(host.id, true)).rejects.toEqual(
      new MatchError('NO_START_TIME'),
    );
  });

  it('reports an unknown match', async () => {
    const { engine } = fakeEngine();
    await expect(engine.join('no-such-match', 'ann', true)).rejects.toBeInstanceOf(MatchNotFound);
  });
});

describe('taps (01 §6, 12 §6)', () => {
  it('marks nothing for the free centre or a number not drawn yet', async () => {
    const t = await runningClassic();
    const m = await t.engine.runner.current(t.id);
    const cells = m.state.currentRound?.cards['person']?.[0]?.card.cells ?? [];
    const free = cells.findIndex((c) => c.kind === 'free');
    expect(await t.engine.mark(t.id, 'person', 0, free)).toBe(false);
    const undrawn = cells.findIndex((c) => c.kind === 'number');
    expect(m.state.currentRound?.draws).toHaveLength(0);
    expect(await t.engine.mark(t.id, 'person', 0, undrawn)).toBe(false);
  });
});
