/**
 * @file   packages/application/src/match/tapRace.test.ts
 * @module application/match
 * @brief  Taps that arrive while a batch or a draw is being stored (12 §5): next batch, none lost.
 *
 * Responsibility: with the store's write held open: taps that arrive while a batch of taps is
 *                 being stored form the very next batch together, once each, timed by their
 *                 arrival (the speed bonus does not shrink while they wait); taps that arrive
 *                 while a draw is being stored come right after that draw, in the next batch,
 *                 once each.
 * Depends on:     vitest, @sbr/domain (types), ./fakes, ./engine (types)
 * Spec:           docs/spec/12-testing-strategy.md §5; docs/spec/01-game-design.md §6
 */
import type { DomainEvent } from '@sbr/domain';
import { describe, expect, it } from 'vitest';

import type { MatchEngine } from './engine.js';
import { fakeEngine } from './fakes.js';

const PEOPLE = ['p1', 'p2', 'p3'];

// A host-drawn classic match with three people and bots, running. Every append records its
// event types in `batches`; after `hold()` appends wait until `open()`, and `started` resolves
// when the first held one has begun.
async function race() {
  const ctx = fakeEngine();
  const batches: string[][] = [];
  let gate: Promise<void> | null = null;
  let release = (): void => undefined;
  let begun = (): void => undefined;
  let started = Promise.resolve();
  const append = ctx.store.append.bind(ctx.store);
  ctx.store.append = async (input) => {
    batches.push(input.events.map((e) => e.type));
    if (gate !== null) {
      begun();
      await gate;
    }
    return append(input);
  };
  const hold = (): void => {
    started = new Promise((resolve) => (begun = resolve));
    gate = new Promise((resolve) => (release = resolve));
  };
  const open = (): void => {
    gate = null;
    release();
  };
  const m = await ctx.engine.create(
    {
      title: 't',
      gameType: 'classic',
      drawMode: 'host',
      missedNumbers: { kind: 'noAutoMark' },
      maxPlayers: 10,
    },
    null,
  );
  for (const p of PEOPLE) await ctx.engine.join(m.id, p, true);
  await ctx.engine.fillWithBots(m.id, 6);
  await ctx.engine.start(m.id, 0);
  await ctx.scheduler.runUntil(ctx.engine, ctx.clock, ctx.clock.t);
  return { ...ctx, id: m.id, batches, hold, open, started: () => started };
}

// The player's open cell holding the newest draw, else any open drawn cell, else -1.
async function openCell(engine: MatchEngine, id: string, player: string): Promise<number> {
  const round = (await engine.runner.current(id)).state.currentRound;
  const card = round?.cards[player]?.[0];
  if (round === null || card === undefined) return -1;
  const open = card.card.cells.flatMap((c, i) =>
    c.kind !== 'free' && round.draws.includes(c.value) && card.marks[i] !== true ? [i] : [],
  );
  const newest = open.find((i) => {
    const c = card.card.cells[i];
    return c?.kind !== 'free' && c?.value === round.draws.at(-1);
  });
  return newest ?? open[0] ?? -1;
}

// Host draws (each after the timed interval) until `ready` holds for the people's open cells.
async function drawUntil(
  r: Awaited<ReturnType<typeof race>>,
  ready: (cells: number[]) => Promise<boolean>,
): Promise<number[]> {
  for (let i = 0; i < 60; i += 1) {
    await r.engine.drawNext(r.id);
    const cells = await Promise.all(PEOPLE.map((p) => openCell(r.engine, r.id, p)));
    if (await ready(cells)) return cells;
    await r.scheduler.runUntil(r.engine, r.clock, r.clock.t + 5_000);
  }
  throw new Error('no draw gave every person an open cell');
}

const marksOf = (published: { event: DomainEvent }[]) =>
  published.flatMap(({ event }) => (event.type === 'cellMarked' ? [event] : []));

describe('taps while a batch or a draw is being stored (12 §5)', () => {
  it('form the next batch at once, each once, timed by their arrival', async () => {
    const r = await race();
    // p2's cell holds the newest draw, so its tap is inside the speed window.
    const cells = await drawUntil(r, async (c) => {
      const round = (await r.engine.runner.current(r.id)).state.currentRound;
      const cell = round?.cards['p2']?.[0]?.card.cells[c[1] ?? -1];
      return c.every((x) => x >= 0) && cell?.kind !== 'free' && cell?.value === round?.draws.at(-1);
    });
    const drawnAt = r.clock.t;
    const sent: (number | undefined)[] = [];
    const apply = r.engine.runner.apply.bind(r.engine.runner);
    r.engine.runner.apply = (matchId, commands, opts) => (
      sent.push(...commands.map((c) => ('receivedAt' in c ? c.receivedAt : undefined))),
      apply(matchId, commands, opts)
    );
    const before = r.batches.length;
    r.hold();
    const first = r.engine.mark(r.id, 'p1', 0, cells[0] ?? -1);
    await r.started();
    r.clock.t = drawnAt + 400;
    const during = [
      r.engine.mark(r.id, 'p2', 0, cells[1] ?? -1),
      r.engine.mark(r.id, 'p3', 0, cells[2] ?? -1),
    ];
    // The next batch runs late: a bonus timed by the batch instead of the arrival would be 0.
    r.clock.t = drawnAt + 2_999;
    r.open();
    expect(await Promise.all([first, ...during])).toEqual([true, true, true]);
    expect(r.batches.slice(before)).toEqual([['cellMarked'], ['cellMarked', 'cellMarked']]);
    expect(sent).toEqual([drawnAt, drawnAt + 400, drawnAt + 400]);
    const marks = marksOf(r.published);
    for (const p of PEOPLE) expect(marks.filter((e) => e.accountId === p)).toHaveLength(1);
    expect(marks.find((e) => e.accountId === 'p2')?.markPoints).toBeGreaterThan(10);
  });

  it('come right after a draw being stored, in the next batch, each once', async () => {
    const r = await race();
    const cells = await drawUntil(r, (c) => Promise.resolve(c.every((x) => x >= 0)));
    await r.scheduler.runUntil(r.engine, r.clock, r.clock.t + 5_000);
    const before = r.batches.length;
    r.hold();
    const drawing = r.engine.drawNext(r.id);
    await r.started();
    const taps = PEOPLE.map((p, i) => r.engine.mark(r.id, p, 0, cells[i] ?? -1));
    r.open();
    await drawing;
    expect(await Promise.all(taps)).toEqual([true, true, true]);
    const stored = r.batches.slice(before);
    expect(stored[0]).toContain('drawMade');
    expect(stored[1]).toEqual(['cellMarked', 'cellMarked', 'cellMarked']);
    const marks = marksOf(r.published);
    for (const p of PEOPLE) expect(marks.filter((e) => e.accountId === p)).toHaveLength(1);
  });
});
