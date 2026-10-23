/**
 * @file   packages/application/src/match/startRules.test.ts
 * @module application/match
 * @brief  How a match starts (01 §7.6, D16): Start, a set time with or without auto start, when full.
 *
 * Responsibility: the host starts a match with a set time before that time; with the
 *                 automatic start on, the countdown begins at the set time when enough
 *                 players have joined; with fewer the match waits (not aborted) and the
 *                 host can still start it; the console's switch takes effect both ways, also
 *                 after the time has passed; "start when full" begins the countdown with the
 *                 last place; a start time too soon or more than a week ahead is refused;
 *                 the start minimum is the ruleset's lobby.minPlayers (default 2).
 * Depends on:     vitest, @sbr/contracts, ./engine, ./fakes, ./startRules
 * Spec:           docs/spec/01-game-design.md §7.6; docs/spec/05-api-design.md §2.3
 */
import { classicRealtimeDefault } from '@sbr/contracts';
import { describe, expect, it } from 'vitest';

import { MatchError } from './engine.js';
import { fakeEngine } from './fakes.js';
import { tooFewAtStart } from './startRules.js';

const base = {
  title: 't',
  gameType: 'classic' as const,
  drawMode: 'auto' as const,
  missedNumbers: { kind: 'autoMarkAfter' as const, delayMs: 3_000 },
  maxPlayers: 20,
};

// A match announced a minute ahead.
async function announced(auto: boolean) {
  const kit = fakeEngine();
  const at = kit.clock.t + 60_000;
  const m = await kit.engine.create({ ...base, startRule: { kind: 'at', at, auto } }, null);
  const status = () => kit.store.records.get(m.id)?.status;
  const autoPending = () => kit.scheduler.pending.some((a) => a.kind === 'auto_start');
  return { ...kit, at, id: m.id, status, autoPending };
}

describe('a set start time (D16)', () => {
  it('is an announcement: the host starts the match before it', async () => {
    const t = await announced(true);
    expect(t.store.records.get(t.id)?.startsAt).toBeNull();
    await t.engine.fillWithBots(t.id, 4);
    await t.engine.start(t.id, 10_000);
    await t.scheduler.runUntil(t.engine, t.clock, t.clock.t + 10_000);
    expect(t.status()).toBe('running');
    expect(t.autoPending()).toBe(false);
  });

  it('starts itself at the time with at least 2 players when set to', async () => {
    const t = await announced(true);
    await t.engine.fillWithBots(t.id, 2);
    await t.scheduler.runUntil(t.engine, t.clock, t.at - 1);
    expect(t.store.records.get(t.id)?.startsAt).toBeNull();
    await t.scheduler.runUntil(t.engine, t.clock, t.at);
    expect(t.store.records.get(t.id)?.startsAt).toBe(t.at + 10_000);
    expect(t.status()).toBe('lobby');
    await t.scheduler.runUntil(t.engine, t.clock, t.at + 10_000);
    expect(t.status()).toBe('running');
  });

  it('waits with fewer than 2 players, and the host can still start it', async () => {
    const t = await announced(true);
    await t.engine.join(t.id, 'person', true);
    await t.scheduler.runUntil(t.engine, t.clock, t.at - 1);
    expect(tooFewAtStart(await t.engine.runner.current(t.id), t.clock.t)).toBe(false);
    await t.scheduler.runUntil(t.engine, t.clock, t.at + 60_000);
    const m = await t.engine.runner.current(t.id);
    expect(t.status()).toBe('lobby');
    expect(tooFewAtStart(m, t.clock.t)).toBe(true);
    await t.engine.fillWithBots(t.id, 2);
    await t.engine.start(t.id, 10_000);
    await t.scheduler.runUntil(t.engine, t.clock, t.clock.t + 10_000);
    expect(t.status()).toBe('running');
  });
});

describe('the automatic start switch (D16)', () => {
  it('does not start itself with the switch off', async () => {
    const t = await announced(false);
    await t.engine.fillWithBots(t.id, 4);
    await t.scheduler.runUntil(t.engine, t.clock, t.at + 60_000);
    const m = await t.engine.runner.current(t.id);
    expect(t.status()).toBe('lobby');
    expect(tooFewAtStart(m, t.clock.t)).toBe(false);
  });

  it('takes the console switch both ways, also after the time has passed', async () => {
    const t = await announced(false);
    await t.engine.fillWithBots(t.id, 4);
    await t.engine.setAutoStart(t.id, true);
    expect(t.autoPending()).toBe(true);
    await t.engine.setAutoStart(t.id, false);
    expect(t.autoPending()).toBe(false);
    await t.scheduler.runUntil(t.engine, t.clock, t.at + 5_000);
    expect(t.status()).toBe('lobby');
    // Switched on after the time: the countdown begins at once.
    await t.engine.setAutoStart(t.id, true);
    await t.scheduler.runUntil(t.engine, t.clock, t.clock.t + 10_000);
    expect(t.status()).toBe('running');
    await expect(t.engine.setAutoStart(t.id, false)).rejects.toEqual(
      new MatchError('MATCH_NOT_IN_LOBBY'),
    );
  });
});

describe('start when full and the time limits (01 §7.6)', () => {
  it('begins the countdown when the last place is taken', async () => {
    const { store, scheduler, clock, engine } = fakeEngine();
    const m = await engine.create(
      { ...base, maxPlayers: 4, startRule: { kind: 'whenFull' } },
      null,
    );
    await engine.fillWithBots(m.id, 3);
    expect(scheduler.pending.some((a) => a.kind === 'start_match')).toBe(false);
    await engine.join(m.id, 'person', true);
    expect(store.records.get(m.id)?.startsAt).toBe(clock.t + 10_000);
    await scheduler.runUntil(engine, clock, clock.t + 10_000);
    expect(store.records.get(m.id)?.status).toBe('running');
  });

  it('refuses a start time too soon or more than a week ahead', async () => {
    const { clock, engine } = fakeEngine();
    const at = (ms: number) => ({
      ...base,
      startRule: { kind: 'at' as const, at: clock.t + ms, auto: false },
    });
    // One minimum for form and server (01 §7.6): at least a minute ahead.
    await expect(engine.create(at(30_000), null)).rejects.toEqual(
      new MatchError('START_TIME_INVALID'),
    );
    await expect(engine.create(at(8 * 24 * 3_600_000), null)).rejects.toEqual(
      new MatchError('START_TIME_INVALID'),
    );
  });
});

describe("the ruleset's start minimum (01 §7.6)", () => {
  // The published default needs 2; a ruleset may ask for more.
  const three = {
    name: 'three to start',
    ruleset: {
      ...classicRealtimeDefault,
      lobby: { ...classicRealtimeDefault.lobby, minPlayers: 3 },
    },
  };

  it('needs 2 players by default', () => {
    expect(classicRealtimeDefault.lobby.minPlayers).toBe(2);
  });

  it('refuses Start below lobby.minPlayers and lets the automatic start wait', async () => {
    const { store, scheduler, clock, engine } = fakeEngine();
    const at = clock.t + 60_000;
    const m = await engine.create(
      { ...base, ruleset: three, startRule: { kind: 'at', at, auto: true } },
      null,
    );
    await engine.fillWithBots(m.id, 2);
    await expect(engine.start(m.id, 10_000)).rejects.toEqual(new MatchError('NOT_ENOUGH_PLAYERS'));
    await scheduler.runUntil(engine, clock, at + 1_000);
    expect(store.records.get(m.id)?.startsAt).toBeNull();
    expect(tooFewAtStart(await engine.runner.current(m.id), clock.t)).toBe(true);
    await engine.fillWithBots(m.id, 3);
    await engine.start(m.id, 10_000);
    expect(store.records.get(m.id)?.startsAt).toBe(clock.t + 10_000);
  });
});
