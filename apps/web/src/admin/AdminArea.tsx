/**
 * @file   apps/web/src/admin/AdminArea.tsx
 * @module web/admin
 * @brief  The admin area's page for a route: the Overview, or one of its sections.
 *
 * Responsibility: `#/admin` is the Overview; `#/admin/<section>` the Presets, the League,
 *                 "Screens and texts" or the History (admin-area §4). Who may see them is the
 *                 server's to decide on every request; the menu shows "Admin" only to admins.
 * Depends on:     react, ../shell/router (types), ./AdminHistory, ./AdminLeague,
 *                 ./AdminOverview, ./AdminPresets, ./AdminScreens
 * Used by:        ../shell/AppShell
 * Spec:           docs/concepts/admin-area.md §4, §8 (a)
 */
import type { ReactElement } from 'react';

import type { AdminSection } from '../shell/router.js';
import { AdminHistory } from './AdminHistory.js';
import { AdminLeague } from './AdminLeague.js';
import { AdminOverview } from './AdminOverview.js';
import { AdminPresets } from './AdminPresets.js';
import { AdminScreens } from './AdminScreens.js';

const PAGES: Readonly<Record<AdminSection, () => ReactElement>> = {
  presets: AdminPresets,
  league: AdminLeague,
  screens: AdminScreens,
  history: AdminHistory,
};

export function AdminArea({
  section,
}: {
  readonly section?: AdminSection | undefined;
}): ReactElement {
  const Page = section === undefined ? AdminOverview : PAGES[section];
  return <Page />;
}
