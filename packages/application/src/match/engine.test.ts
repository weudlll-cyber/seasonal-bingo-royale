/**
 * @file   packages/application/src/match/engine.test.ts
 * @module application/match
 * @brief  The live match engine with in-memory ports: the timed flow, host draws, D8, marks.
 *
 * Responsibility: a classic and a royale match with bots run from start to finish through
 *                 scheduled actions alone, every round ending only after its last window
 *                 closed (D10); host draws are refused in timed mode and while a window is
 *                 open; switching to timed draws schedules the next draw one interval after
 *                 the switch (D8); a tap inside the window earns the speed bonus, a later
 *                 tap does not (01 §6).
 * Depends on:     vitest, ./engine, ./fakes
 * Spec:           docs/spec/01-game-design.md §5–§7; docs/spec/06-realtime-architecture.md §4–§5
 */
import type { MissedNumbers } from '@sbr/domain';
import { describe, expect, it } from 'vitest';

import { MatchEngine, MatchError } from './engine.js';
import { nextDrawAt, waitingForHost } from './flow.js';
import { fakeEngine } from './fakes.js';

const setUp = fakeEngine;

const base = {
  title: 't',
  drawMode: 'auto' as const,
  missedNumbers: { kind: 'autoMarkAfter' as const, delayMs: 3_000 },
  maxPlayers: 20,
};

describe('timed flow', () => {
  it.each(['classic', 'royale'] as const)(
    'plays a %s match with bots to the finish',
    async (gameType) => {
      const { store, scheduler, clock, engine } = setUp();
      const m = await engine.create(
        { ...base, gameType, prizes: gameType === 'classic' ? ['fullCard'] : undefined },
        null,
      );
      await engine.join(m.id, 'person', true);
      await engine.fillWithBots(m.id, 20);
      await engine.start(m.id, 1_000);
      await scheduler.runUntil(engine, clock, Number.POSITIVE_INFINITY);
      const types = store.types(m.id);
      expect(types.at(-1)).toBe('matchFinished');
      expect(store.records.get(m.id)?.status).toBe('finished');
      // D10: every round end comes right after the window close of its last draw.
      types.forEach((t, i) => {
        if (t === 'roundEnded') expect(types[i - 1]).toBe('speedWindowClosed');
      });
    },
  );
});

describe('pause between royale rounds (D14)', () => {
  it('tells the screens when the next round starts after a round and its cut', async () => {
    const { scheduler, clock, engine, published } = setUp();
    const roundPause = { kind: 'wait', ms: 4_000 } as const;
    const m = await engine.create({ ...base, gameType: 'royale', roundPause }, null);
    await engine.fillWithBots(m.id, 20);
    await engine.start(m.id, 1_000);
    await scheduler.runUntil(engine, clock, Number.POSITIVE_INFINITY);
    // In the event log (it survives a restart): one per pause, the time plus the wait.
    const pauses = published.filter((p) => p.event.type === 'nextRoundScheduled');
    expect(pauses.length).toBeGreaterThan(1);
    for (const p of pauses)
      expect(p.event).toEqual({ type: 'nextRoundScheduled', at: p.at + 4_000 });
  });

  it('waits for the host between royale rounds when the host starts them (D14)', async () => {
    const { store, scheduler, clock, engine } = setUp();
    const m = await engine.create(
      { ...base, gameType: 'royale', roundPause: { kind: 'host' } },
      null,
    );
    await engine.fillWithBots(m.id, 20);
    await engine.start(m.id, 1_000);
    // Everything that is scheduled runs: the first round plays out, then nothing starts.
    await scheduler.runUntil(engine, clock, Number.POSITIVE_INFINITY);
    const rounds = () => store.types(m.id).filter((t) => t === 'roundStarted').length;
    expect(rounds()).toBe(1);
    expect(store.types(m.id)).toContain('cutApplied');
    expect(waitingForHost(await engine.runner.current(m.id))).toBe(true);
    clock.t += 600_000;
    await scheduler.runUntil(engine, clock, Number.POSITIVE_INFINITY);
    expect(rounds()).toBe(1);
    await engine.startNextRound(m.id);
    expect(rounds()).toBe(2);
    await expect(engine.startNextRound(m.id)).rejects.toEqual(
      new MatchError('NOT_WAITING_FOR_HOST'),
    );
  });

  it('keeps a waiting pause at 3 s or more, 6 s by default (D14)', async () => {
    const { engine } = setUp();
    const short = await engine.create(
      { ...base, gameType: 'royale', roundPause: { kind: 'wait', ms: 1_000 } },
      null,
    );
    const plain = await engine.create({ ...base, gameType: 'royale' }, null);
    expect(short.settings.roundPause).toEqual({ kind: 'wait', ms: 3_000 });
    expect(plain.settings.roundPause).toEqual({ kind: 'wait', ms: 6_000 });
  });
});

describe('shortest timed-draw interval (D12)', () => {
  it('is 1 s longer than the longest tap time, at creation and when the host changes it', async () => {
    const { engine } = setUp();
    const slow = { kind: 'autoMarkAfter', delayMs: 5_000 } as const;
    const m = await engine.create(
      { ...base, gameType: 'classic', missedNumbers: slow, drawIntervalMs: 2_000 },
      null,
    );
    expect(m.settings.drawIntervalMs).toBe(6_000);
    const open = await engine.create(
      {
        ...base,
        gameType: 'classic',
        missedNumbers: { kind: 'noAutoMark' },
        drawIntervalMs: 2_000,
      },
      null,
    );
    // Speed window 3 s + 1 s.
    expect(open.settings.drawIntervalMs).toBe(4_000);
    expect((await engine.setDrawControl(m.id, 'auto', 1_000)).settings.drawIntervalMs).toBe(6_000);
  });
});

async function runningHostMatch(missedNumbers: MissedNumbers = base.missedNumbers) {
  const ctx = setUp();
  const m = await ctx.engine.create(
    { ...base, gameType: 'classic', drawMode: 'host', missedNumbers },
    null,
  );
  await ctx.engine.join(m.id, 'person', true);
  await ctx.engine.fillWithBots(m.id, 5);
  await ctx.engine.start(m.id, 0);
  await ctx.scheduler.runUntil(ctx.engine, ctx.clock, ctx.clock.t);
  return { ...ctx, id: m.id };
}

describe('host draws and draw control (D8, D13)', () => {
  it('draws on Draw next only after the previous window closed', async () => {
    const { engine, scheduler, clock, store, id } = await runningHostMatch();
    await engine.drawNext(id);
    await expect(engine.drawNext(id)).rejects.toEqual(new MatchError('DRAW_NOT_ALLOWED'));
    await scheduler.runUntil(engine, clock, clock.t + 5_000);
    await engine.drawNext(id);
    expect(store.types(id).filter((t) => t === 'drawMade')).toHaveLength(2);
  });

  it('keeps Draw next locked until the timed interval since the last draw has passed (D13)', async () => {
    const { engine, scheduler, clock, id } = await runningHostMatch();
    const first = clock.t;
    await engine.drawNext(id);
    // The window (3 s) has closed, but the match's 5 s interval has not passed.
    await scheduler.runUntil(engine, clock, first + 4_999);
    expect(nextDrawAt(await engine.runner.current(id))).toBe(first + 5_000);
    await expect(engine.drawNext(id)).rejects.toEqual(new MatchError('DRAW_TOO_EARLY'));
    clock.t = first + 5_000;
    await engine.drawNext(id);
  });

  it('refuses Draw next in timed mode, and resumes timed draws one interval after a switch', async () => {
    const { engine, scheduler, clock, id } = await runningHostMatch();
    const switchedAt = clock.t;
    const record = await engine.setDrawControl(id, 'auto', 5_000);
    expect(record.settings).toMatchObject({ drawMode: 'auto', drawIntervalMs: 5_000 });
    expect(scheduler.pending.find((a) => a.kind === 'draw')?.dueAt).toBe(switchedAt + 5_000);
    await expect(engine.drawNext(id)).rejects.toEqual(new MatchError('DRAW_MODE_AUTO'));
    await engine.setDrawControl(id, 'host');
    expect(scheduler.pending.some((a) => a.kind === 'draw')).toBe(false);
  });
});

// The person's cell holding the latest drawn number, or -1.
async function personCellOfLastDraw(engine: MatchEngine, id: string): Promise<number> {
  const round = (await engine.runner.current(id)).state.currentRound;
  const item = round?.draws.at(-1);
  const cells = round?.cards['person']?.[0]?.card.cells ?? [];
  return cells.findIndex((c) => c.kind !== 'free' && c.value === item);
}

// Draws until one of the person's numbers comes, taps it delayMs later, returns its points.
async function tapAfter(ctx: Awaited<ReturnType<typeof runningHostMatch>>, delayMs: number) {
  const { engine, scheduler, clock, store, id } = ctx;
  for (let i = 0; i < 40; i += 1) {
    await engine.drawNext(id);
    const cell = await personCellOfLastDraw(engine, id);
    clock.t += delayMs;
    if (cell >= 0 && (await engine.mark(id, 'person', 0, cell))) {
      const last = store.events.get(id)?.at(-1)?.event;
      return last?.type === 'cellMarked' ? last.markPoints : null;
    }
    // The next host draw unlocks one timed interval (5 s) after this one (D13).
    await scheduler.runUntil(engine, clock, clock.t + 5_000);
  }
  return null;
}

describe('taps (01 §6)', () => {
  it('scores the speed bonus for a tap inside the window', async () => {
    expect(await tapAfter(await runningHostMatch(), 500)).toBeGreaterThan(10);
  });

  it('scores no bonus for a tap after the window', async () => {
    expect(await tapAfter(await runningHostMatch({ kind: 'noAutoMark' }), 4_000)).toBe(10);
  });
});
