/**
 * @file   apps/server/test/session.ts
 * @module server/test
 * @brief  A signed-in test client: dev quick sign-in, cookie and CSRF token on every call.
 *
 * Responsibility: sign in through POST /api/v1/dev/sign-in, read the CSRF token from GET
 *                 /api/v1/session, and send both with every request, as a browser does.
 * Depends on:     fastify (inject)
 * Used by:        ./firstRound, ./socketKit, the integration tests in this folder
 * Spec:           docs/spec/03-security-architecture.md §3, §8
 */
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

export interface Client {
  readonly cookie: string;
  readonly csrf: string;
  post(url: string, body: unknown): Promise<LightMyRequestResponse>;
  put(url: string, body: unknown): Promise<LightMyRequestResponse>;
  get(url: string): Promise<LightMyRequestResponse>;
}

export async function signIn(
  app: FastifyInstance,
  as: 'host' | 'player-1' | 'player-2' | 'player-3',
): Promise<Client> {
  const r = await app.inject({ method: 'POST', url: '/api/v1/dev/sign-in', payload: { as } });
  const cookie = `sbr_session=${r.cookies.find((c) => c.name === 'sbr_session')?.value ?? ''}`;
  const s = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { cookie } });
  const csrf = s.json<{ csrfToken: string }>().csrfToken;
  const headers = { cookie, 'x-csrf-token': csrf };
  return {
    cookie,
    csrf,
    post: (url, body) => app.inject({ method: 'POST', url, payload: body as object, headers }),
    put: (url, body) => app.inject({ method: 'PUT', url, payload: body as object, headers }),
    get: (url) => app.inject({ method: 'GET', url, headers }),
  };
}
