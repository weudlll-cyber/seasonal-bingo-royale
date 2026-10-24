/**
 * @file   apps/server/src/http/routes/maintenance.ts
 * @module server/http
 * @brief  GET /api/v1/maintenance — whether maintenance is on, and why, for the player client.
 *
 * Responsibility: answer `{ on, reason }` from the maintenance flag (../../config/maintenance)
 *                 to anyone, signed in or not, so every screen can show the maintenance page
 *                 or banner while `sbr maintenance on` is set (09 §4).
 * Depends on:     fastify, ../../config/maintenance
 * Used by:        ../app
 * Spec:           docs/spec/09-deployment-architecture.md §4; docs/spec/05-api-design.md §2.3a
 */
import type { FastifyInstance } from 'fastify';

import type { MaintenanceCheck } from '../../config/maintenance.js';

export function registerMaintenance(app: FastifyInstance, maintenance: MaintenanceCheck): void {
  app.get('/api/v1/maintenance', () => {
    const now = maintenance();
    return { on: now !== null, reason: now?.reason ?? null };
  });
}
