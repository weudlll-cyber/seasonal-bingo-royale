// @vitest-environment jsdom
/**
 * @file   apps/web/src/shell/headerSteps.test.tsx
 * @module web/shell
 * @brief  A member's own step badges in the header (kit K56).
 *
 * Responsibility: the session's `account.steps` (website mode) reach the kit's header, which
 *                 draws each as a named icon beside the account's name; an account without steps
 *                 (standalone installs) shows the header as before.
 * Depends on:     @testing-library/react, ./AppShell, ./session
 * Spec:           docs/spec/07-integration-architecture.md §2.3
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell.js';
import { SessionProvider } from './session.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ICON = '/media/step-icons/0123456789abcdef0123456789abcdef.webp';

// A signed-in member's session, with or without steps.
function serve(steps?: readonly object[]): void {
  const session = {
    signedIn: true,
    kind: 'player',
    account: { id: 'a1', displayName: 'Badged', ...(steps === undefined ? {} : { steps }) },
    permissions: [],
    csrfToken: 'x',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify(url.endsWith('/session') ? session : { matches: [] })),
      ),
    ),
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function renderShell(): Promise<void> {
  render(
    <SessionProvider>
      <AppShell dev={false} />
    </SessionProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('signed-in-as').textContent).toContain('Badged');
  });
}

describe("the header's step badges", () => {
  it("shows a member's steps beside the account's name", async () => {
    serve([{ ladder: 'holder', name: 'Golden', icon: ICON }]);
    await renderShell();
    const badge = screen.getByRole('img', { name: 'Golden' });
    expect(badge.getAttribute('src')).toBe(ICON);
    expect(badge.className).toContain('sk-header-step');
  });

  it('shows none for an account without steps, as in a standalone install', async () => {
    serve();
    await renderShell();
    expect(document.querySelector('.sk-header-step')).toBeNull();
  });
});
