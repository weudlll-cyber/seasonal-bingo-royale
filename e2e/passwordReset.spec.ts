/**
 * @file   e2e/passwordReset.spec.ts
 * @module e2e
 * @brief  "Forgot password?" end to end through Mailpit (standalone, D60).
 *
 * Responsibility: a new local account signed in on one device asks for a reset on the sign-in
 *                 page; the mail arrives in Mailpit with the link; the link sets a new password;
 *                 the other device's session is gone, the old password fails and the new one
 *                 signs in. The account is deleted at the end (DELETE /me with the new password).
 * Depends on:     @playwright/test, ./devStack
 * Spec:           docs/spec/03-security-architecture.md §1; docs/spec/12-testing-strategy.md §4
 */
import { expect, request, test, type APIRequestContext } from '@playwright/test';

import { CLIENT_URL, mailpit } from './devStack.js';

const OLD = 'correct horse battery staple';
const NEW = 'another long passphrase now';

// The newest mail Mailpit holds for this address, as text.
async function mailTo(address: string): Promise<string> {
  const box = await request.newContext({ baseURL: mailpit().apiUrl });
  try {
    let text = '';
    await expect
      .poll(
        async () => {
          const found = (await (
            await box.get(`/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)
          ).json()) as { messages: { ID: string }[] };
          const id = found.messages[0]?.ID;
          if (id === undefined) return false;
          text = ((await (await box.get(`/api/v1/message/${id}`)).json()) as { Text: string }).Text;
          return true;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    return text;
  } finally {
    await box.dispose();
  }
}

async function csrf(ctx: APIRequestContext): Promise<string> {
  return ((await (await ctx.get('/api/v1/session')).json()) as { csrfToken: string }).csrfToken;
}

test('a forgotten password is reset through the e-mailed link; the other sessions end', async ({
  page,
}) => {
  const stamp = String(Date.now() % 1_000_000);
  const email = `reset-${stamp}@example.com`;
  const other = await request.newContext({ baseURL: CLIENT_URL });
  const registered = await other.post('/api/v1/auth/register', {
    data: { email, displayName: `reset${stamp}`, password: OLD },
  });
  expect(registered.status()).toBe(201);
  try {
    await page.goto('/#/sign-in');
    await page.getByTestId('forgot-link').click();
    await page.getByTestId('forgot-email').fill(email);
    await page.getByTestId('forgot-submit').click();
    await expect(page.getByTestId('forgot-sent')).toBeVisible();
    const token = /token=([\w-]+)/.exec(await mailTo(email))?.[1] ?? '';
    expect(token.length).toBeGreaterThan(40);
    await page.goto(`/#/reset-password?token=${token}`);
    await page.getByTestId('reset-password').fill(NEW);
    await page.getByTestId('reset-again').fill(NEW);
    await page.getByTestId('reset-submit').click();
    await expect(page.getByTestId('reset-done')).toBeVisible();
    const gone = (await (await other.get('/api/v1/session')).json()) as { signedIn: boolean };
    expect(gone.signedIn).toBe(false);
    expect(
      (await other.post('/api/v1/auth/login', { data: { email, password: OLD } })).status(),
    ).toBe(401);
    await page.goto('/#/sign-in');
    await page.getByTestId('sign-in-email').fill(email);
    await page.getByTestId('sign-in-password').fill(NEW);
    await page.getByTestId('sign-in-submit').click();
    await expect(page.getByTestId('signed-in-as')).toBeVisible();
  } finally {
    await other.post('/api/v1/auth/login', { data: { email, password: NEW } });
    await other.delete('/api/v1/me', {
      data: { password: NEW },
      headers: { 'x-csrf-token': await csrf(other) },
    });
    await other.dispose();
  }
});
