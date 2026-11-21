/**
 * @file   apps/web/src/admin/AdminNav.tsx
 * @module web/admin
 * @brief  The admin area's own navigation: Overview and History.
 *
 * Responsibility: the sections built so far as links under the page title, the current one
 *                 marked (aria-current), wrapping on a phone.
 * Depends on:     react, ../shell/router
 * Used by:        ./AdminOverview, ./AdminHistory
 * Spec:           docs/concepts/admin-area.md §4
 */
import type { ReactElement } from 'react';

import { hrefOf } from '../shell/router.js';

export function AdminNav({ current }: { readonly current: 'overview' | 'history' }): ReactElement {
  const link = (section: 'overview' | 'history', label: string) => (
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
      {link('history', 'History')}
    </nav>
  );
}
