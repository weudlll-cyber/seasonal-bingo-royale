/**
 * @file   apps/web/src/components/DevBadge.tsx
 * @module web
 * @brief  Fixed-position dev badge (08 §1.1): "Bingo · dev · <port>".
 *
 * Responsibility: show the dev badge in a corner while `import.meta.env.DEV` is true;
 *                 render nothing in a production build. The port number comes from the
 *                 Vite config via `__SBR_DEV_PORT__`.
 * Depends on:     react
 * Used by:        ../App
 * Spec:           docs/spec/08-devops-architecture.md §1.1
 */
import type { ReactElement } from 'react';

declare const __SBR_DEV_PORT__: number;

export function DevBadge(): ReactElement | null {
  if (!import.meta.env.DEV) return null;
  return (
    <div
      aria-label="Development build badge"
      style={{
        position: 'fixed',
        left: '0.75rem',
        bottom: '0.75rem',
        padding: '0.25rem 0.5rem',
        fontSize: '0.75rem',
        background: '#04aaf7',
        color: '#0f1115',
        borderRadius: '0.25rem',
        zIndex: 1_000,
      }}
    >
      Bingo · dev · {__SBR_DEV_PORT__}
    </div>
  );
}
