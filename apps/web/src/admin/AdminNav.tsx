/**
 * @file   apps/web/src/admin/AdminNav.tsx
 * @module web/admin
 * @brief  The admin area's own navigation: its sections, Technical only for those who may change it.
 *
 * Responsibility: the sections built so far as links under the page title, the current one
 *                 marked (aria-current), wrapping on a phone.
 * Depends on:     react, ../shell/router, ../shell/session
 * Used by:        ./AdminOverview, ./AdminPresets, ./AdminLeague, ./AdminScreens, ./AdminTechnical,
 *                 ./AdminHistory
 * Spec:           docs/concepts/admin-area.md §4
 */
import type { ReactElement } from 'react';

import { hrefOf, type AdminSection } from '../shell/router.js';
import { useSession } from '../shell/session.js';

type Section = 'overview' | AdminSection;

export function AdminNav({ current }: { readonly current: Section }): ReactElement {
  const { can, session } = useSession();
  // Technical: the owner standalone, website admins in website mode (admin-area §8 (e), (f));
  // the server checks it on every request either way.
  const technical =
    can('technical.edit') || (session?.authMode === 'website' && can('settings.edit'));
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
      {technical ? link('technical', 'Technical') : null}
      {link('history', 'History')}
    </nav>
  );
}
