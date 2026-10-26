/**
 * @file   e2e/startScreens.spec.ts
 * @module e2e
 * @brief  How a match starts and how a cancelled one ends, in the browser (D16, D17, NIGHT-4).
 *
 * Responsibility: for each start rule the host's console and the player's waiting room show
 *                 the same registration line ("Registration open until the host starts the
 *                 match", "Starts at … · the host starts it" / "· starts automatically",
 *                 "3 places left"); an automatic start that finds no players leaves the match
 *                 waiting and the console says "Not enough players at the start time — start
 *                 it yourself or abort"; "Starting…" and the countdown appear once the host
 *                 starts. A match cancelled by the host or by the system shows its end page to
 *                 host and player. In Chromium each screen is saved at desktop and phone size,
 *                 light and dark. Every match the test opens is stopped (it stays aborted).
 * Depends on:     @playwright/test, ./realGame, ./screens
 * Spec:           docs/spec/01-game-design.md §7.6, §13; docs/spec/05-api-design.md §2.3
 */
import { expect, test, type Browser, type Page } from '@playwright/test';

import { closeContexts, post, signIn, stopMatch, type Who } from './realGame.js';
import { captureLook, DESKTOP, SHOTS_DIR } from './screens.js';

type StartRule =
  | { readonly kind: 'host' }
  | { readonly kind: 'at'; readonly at: number; readonly auto: boolean }
  | { readonly kind: 'whenFull' };

async function open(browser: Browser, who: Who): Promise<Page> {
  const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  await signIn(page, who);
  return page;
}

// Plain titles: they show in the screenshots.
const TITLES: Record<StartRule['kind'], string> = {
  host: 'Friday bingo',
  at: 'Bingo at eight',
  whenFull: 'Bingo when full',
};

// Opens a match with the start rule over the API; the player joins unless told not to.
async function openMatch(
  host: Page,
  player: Page,
  startRule: StartRule,
  join = true,
): Promise<string> {
  const r = await post(host, '/api/v1/matches', {
    title: TITLES[startRule.kind],
    gameType: 'royale',
    drawMode: 'host',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 4,
    startRule,
  });
  expect(r.status()).toBe(201);
  const { code } = (await r.json()) as { code: string };
  if (join) await post(player, `/api/v1/matches/${code}/join`, {});
  return code;
}

// The registration line on both screens, which must read the same.
async function registration(host: Page, player: Page, code: string): Promise<string> {
  await host.goto(`/#/host/${code}`);
  await player.goto(`/#/match/${code}`);
  const line = (await host.getByTestId('host-start-rule').textContent()) ?? '';
  await expect(player.getByTestId('registration')).toHaveText(line);
  return line;
}

// Saves each page at both sizes and themes; `show` keeps one element in view (a notice
// below the fold on a phone).
async function shoot(shots: boolean, pages: [Page, string, string?][]): Promise<void> {
  if (!shots) return;
  for (const [page, name, show] of pages) {
    await captureLook(
      page,
      SHOTS_DIR,
      name,
      show === undefined ? undefined : page.getByTestId(show),
    );
  }
}

// An automatic start a minute ahead (the shortest allowed) with nobody in: the match waits
// and the console says so.
async function checkTooFew(host: Page, player: Page, shots: boolean): Promise<string> {
  const rule = { kind: 'at', at: Date.now() + 62_000, auto: true } as const;
  const code = await openMatch(host, player, rule, false);
  await host.goto(`/#/host/${code}`);
  await expect(host.getByTestId('host-too-few')).toHaveText(
    'Not enough players at the start time — start it yourself or abort.',
    { timeout: 90_000 },
  );
  await expect(host.getByTestId('host-status')).toHaveAttribute('data-status', 'lobby');
  await player.goto(`/#/match/${code}`);
  await shoot(shots, [
    [host, 'start-too-few-console', 'host-too-few'],
    [player, 'start-too-few-waiting'],
  ]);
  return code;
}

// The host starts a match: only now "Starting…" and the countdown.
async function checkCountdown(host: Page, player: Page, code: string, shots: boolean) {
  await post(host, `/api/v1/matches/${code}/bots`, { upTo: 2 });
  await host.goto(`/#/host/${code}`);
  await player.goto(`/#/match/${code}`);
  await expect(player.getByTestId('countdown')).toHaveCount(0);
  await host.getByTestId('start-match').click();
  await expect(host.getByTestId('host-countdown')).toHaveText(
    'Starting… players see the countdown.',
  );
  await expect(player.getByTestId('countdown')).toContainText('Starting in');
  await shoot(shots, [[player, 'start-countdown-waiting']]);
}

// Contexts this spec opens are closed after every test (see closeContexts).
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test('the registration line, the D16 notice and the countdown', async ({ browser }, info) => {
  test.setTimeout(300_000);
  const shots = info.project.name === 'chromium';
  const host = await open(browser, 'host');
  const player = await open(browser, 'player-1');
  const codes: string[] = [];
  const hourAhead = Date.now() + 3_600_000;
  const cases: [StartRule, RegExp, string][] = [
    [{ kind: 'host' }, /^Registration open until the host starts the match$/, 'host'],
    [
      { kind: 'at', at: hourAhead, auto: false },
      /^Starts .+ \(in .+\) · the host starts it$/,
      'at',
    ],
    [
      { kind: 'at', at: hourAhead, auto: true },
      /^Starts .+ \(in .+\) · starts automatically$/,
      'auto',
    ],
    [{ kind: 'whenFull' }, /^3 places left$/, 'when-full'],
  ];
  try {
    for (const [rule, expected, name] of cases) {
      const code = await openMatch(host, player, rule);
      codes.push(code);
      expect(await registration(host, player, code)).toMatch(expected);
      await expect(host.getByTestId('start-match')).toBeVisible();
      await shoot(shots, [
        [host, `start-${name}-console`],
        [player, `start-${name}-waiting`],
      ]);
    }
    codes.push(await checkTooFew(host, player, shots));
    await checkCountdown(host, player, codes[0] ?? '', shots);
  } finally {
    for (const code of codes) await stopMatch(host, code);
  }
});

test('the cancelled-match page after a host and a system abort', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const shots = info.project.name === 'chromium';
  const host = await open(browser, 'host');
  const player = await open(browser, 'player-2');
  for (const by of ['host', 'system'] as const) {
    const code = await openMatch(host, player, { kind: 'host' });
    const route = by === 'host' ? 'abort' : 'dev-system-abort';
    await post(host, `/api/v1/matches/${code}/${route}`, { reason: 'Power cut in the hall' });
    await host.goto(`/#/host/${code}`);
    await player.goto(`/#/match/${code}`);
    for (const page of [host, player]) {
      await expect(page.getByTestId('cancelled-by')).toHaveText(
        `This match was cancelled by the ${by}.`,
      );
      await expect(page.getByTestId('cancelled-reason')).toHaveText(
        'Reason: Power cut in the hall',
      );
      await expect(page.getByTestId('arena')).toHaveCount(0);
    }
    await expect(host.getByTestId('end-actions')).toContainText('Host another match');
    await expect(player.getByTestId('end-actions')).toHaveText(
      'Back to the lobbyVerify this match',
    );
    await shoot(shots, [
      [host, `cancelled-${by}-host`],
      [player, `cancelled-${by}-player`],
    ]);
  }
});
