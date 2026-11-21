/**
 * @file   apps/web/src/admin/AdminNav.tsx
 * @module web/admin
 * @brief  The admin area's own navigation: Overview, Presets, League, Screens and texts, History.
 *
 * Responsibility: the sections built so far as links under the page title, the current one
 *                 marked (aria-current), wrapping on a phone.
 * Depends on:     react, ../shell/router
 * Used by:        ./AdminOverview, ./AdminPresets, ./AdminLeague, ./AdminScreens, ./AdminHistory
 * Spec:           docs/concepts/admin-area.md §4
 */
import type { ReactElement } from 'react';

import { hrefOf } from '../shell/router.js';

type Section = 'overview' | 'presets' | 'league' | 'screens' | 'history';

export function AdminNav({ current }: { readonly current: Section }): ReactElement {
  const link = (section: Section, label: string) => (
    <a
      className="sbr-chip"
      href={hrefOf(section === 'overview' ? { name: 'admin' } : { name: 'admin', section })}
      aria-current={current === section ? 'page' : undefined}
    >
      {label}
    </a>
  );
  return (
    <nav className="admin-nav" aria-label="Admin">
      {link('overview', 'Overview')}
      {link('presets', 'Presets')}
      {link('league', 'League')}
      {link('screens', 'Screens and texts')}
      {link('history', 'History')}
    </nav>
  );
}
