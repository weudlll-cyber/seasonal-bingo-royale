/**
 * @file   packages/application/src/match/asyncMatch.test.ts
 * @module application/match
 * @brief  Asynchronous matches on the engine with in-memory ports (01 §5, §6, §11; 06 §6).
 *
 * Responsibility: an asynchronous royale opens with the royale-async ruleset, a 15-minute
 *                 interval, automatic marking, the ruleset's quiet hours and the starter's
 *                 time zone; its interval stays within one minute and one day; a classic
 *                 type cannot be asynchronous; no draw happens inside the quiet hours (the
 *                 first one waits for their end, a due one is moved there, Draw next is
 *                 refused); after downtime the missed draws are caught up, then the cadence
 *                 resumes.
 * Depends on:     ./engine, ./fakes
 * Spec:           docs/spec/01-game-design.md §5, §6, §11; docs/spec/06-realtime-architecture.md §6
 */
import { describe, expect, it } from 'vitest';

import { MatchError } from './engine.js';
import { fakeEngine } from './fakes.js';

const utc = (iso: string): number => Date.parse(`${iso}Z`);
const MIN = 60_000;
const base = {
  title: 'Slow one',
  gameType: 'royale' as const,
  mode: 'async' as const,
  drawMode: 'auto' as const,
  missedNumbers: { kind: 'noAutoMark' as const },
  maxPlayers: 20,
  timeZone: 'UTC',
};

// An asynchronous royale with a person and bots, started at `at` (1 s countdown).
async function started(at: number, extra: Record<string, unknown> = {}) {
  const f = fakeEngine();
  f.clock.t = at;
  const m = await f.engine.create({ ...base, ...extra }, null);
  await f.engine.join(m.id, 'person', true);
  await f.engine.fillWithBots(m.id, 8);
  await f.engine.start(m.id, 1_000);
  await f.scheduler.runUntil(f.engine, f.clock, at + 2_000);
  return { ...f, id: m.id };
}

const drawTimes = (published: readonly { at: number; event: { type: string } }[]): number[] =>
  published.filter((p) => p.event.type === 'drawMade').map((p) => p.at);

describe('creating an asynchronous match', () => {
  it('takes the async defaults: ruleset, 15 minutes, automatic marking, quiet hours', async () => {
    const { engine } = fakeEngine();
    const m = await engine.create({ ...base, timeZone: 'Europe/Berlin' }, null);
    expect(m.ruleset.mode).toBe('async');
    expect(m.rulesetName).toBe('royale-async');
    expect(m.settings.markingMode).toBe('auto');
    expect(m.settings.drawIntervalMs).toBe(15 * MIN);
    expect(m.settings.quietHours).toEqual({ startHour: 0, endHour: 7 });
    expect(m.settings.timeZone).toBe('Europe/Berlin');
  });

  it('keeps the interval within one minute and one day, and falls back to UTC', async () => {
    const { engine } = fakeEngine();
    const short = await engine.create(
      { ...base, drawIntervalMs: 5_000, timeZone: 'Nowhere' },
      null,
    );
    expect(short.settings.drawIntervalMs).toBe(MIN);
    expect(short.settings.timeZone).toBe('UTC');
    const long = await engine.create({ ...base, drawIntervalMs: 3 * 86_400_000 }, null);
    expect(long.settings.drawIntervalMs).toBe(86_400_000);
    const quiet = await engine.create({ ...base, quietHours: null }, null);
    expect(quiet.settings.quietHours).toBeNull();
  });

  it('refuses an asynchronous classic match and leaves realtime matches without quiet hours', async () => {
    const { engine } = fakeEngine();
    await expect(
      engine.create({ ...base, gameType: 'classic', prizes: ['rows-1'] }, null),
    ).rejects.toEqual(new MatchError('ASYNC_ROYALE_ONLY'));
    const live = await engine.create({ ...base, mode: 'realtime' }, null);
    expect(live.ruleset.mode).toBe('realtime');
    expect(live.settings.quietHours).toBeNull();
    expect(live.settings.markingMode).toBe('manual');
  });
});

describe('quiet hours', () => {
  it('holds the first draw until the quiet hours end, then keeps the cadence', async () => {
    const { engine, scheduler, clock, published } = await started(utc('2026-06-10T23:50:00'));
    await scheduler.runUntil(engine, clock, utc('2026-06-11T07:20:00'));
    expect(drawTimes(published)).toEqual([utc('2026-06-11T07:00:00'), utc('2026-06-11T07:15:00')]);
  });

  it('moves a draw that comes due inside the quiet hours to their end', async () => {
    const { engine, scheduler, clock, published, id } = await started(utc('2026-06-10T12:00:00'));
    clock.t = utc('2026-06-11T01:00:00');
    scheduler.pending = scheduler.pending.filter((a) => a.kind !== 'draw');
    await engine.handle({ matchId: id, kind: 'draw', dueAt: clock.t });
    expect(drawTimes(published)).toEqual([]);
    expect(scheduler.pending.find((a) => a.kind === 'draw')?.dueAt).toBe(
      utc('2026-06-11T07:00:00'),
    );
  });

  it('refuses Draw next inside the quiet hours', async () => {
    const { engine, id } = await started(utc('2026-06-11T01:00:00'), { drawMode: 'host' });
    await expect(engine.drawNext(id)).rejects.toEqual(new MatchError('QUIET_HOURS'));
  });
});

describe('catch-up after downtime (06 §6)', () => {
  it('makes the missed draws at the catch-up pace, then resumes the cadence', async () => {
    const start = utc('2026-06-10T12:00:00');
    const { engine, scheduler, clock, published } = await started(start);
    const first = start + 1_000 + 15 * MIN;
    await scheduler.runUntil(engine, clock, first);
    expect(drawTimes(published)).toEqual([first]);
    // The server was down for two hours: nothing ran in between.
    clock.t = first + 120 * MIN;
    await scheduler.runUntil(engine, clock, first + 130 * MIN);
    const late = drawTimes(published).slice(1);
    // The 8 draws planned at +15 … +120 min, each after the previous window (3 s) closed.
    expect(late).toHaveLength(8);
    expect(late.at(-1)).toBeLessThanOrEqual(first + 120 * MIN + 30_000);
    expect(scheduler.pending.find((a) => a.kind === 'draw')?.dueAt).toBe(first + 135 * MIN);
  });
});
