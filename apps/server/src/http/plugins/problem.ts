/**
 * @file   apps/server/src/http/plugins/problem.ts
 * @module server/http
 * @brief  Error handler that returns RFC 9457 application/problem+json.
 *
 * Responsibility: translate thrown errors (and 404s) into a {type,title,status,code,
 *                 detail,requestId} body with the correct Content-Type. Never leaks
 *                 stack traces (05 §1).
 * Depends on:     fastify
 * Used by:        ../app.ts
 * Spec:           docs/spec/05-api-design.md §1, docs/spec/05-api-design.md §5
 */
import type { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify';

const CONTENT_TYPE = 'application/problem+json; charset=utf-8';

export function registerProblemDetails(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    send(reply, request, {
      status: 404,
      code: 'NOT_FOUND',
      title: 'Not Found',
      detail: `No route matches ${request.method} ${request.url}`,
    });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    const code = typeof error.code === 'string' && error.code.length > 0 ? error.code : 'INTERNAL';
    // Fastify's default validation error already carries validation details; keep its
    // message when known, otherwise swallow 5xx details because they can leak internals.
    const detail = status < 500 ? error.message : 'Internal server error';
    if (status >= 500) request.log.error({ err: error }, 'Request failed');
    send(reply, request, { status, code, title: titleFor(status), detail });
  });
}

interface Problem {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
}

function send(reply: FastifyReply, request: FastifyRequest, problem: Problem): void {
  reply
    .status(problem.status)
    .header('content-type', CONTENT_TYPE)
    .send({
      type: `https://errors.sbr/${problem.code.toLowerCase()}`,
      title: problem.title,
      status: problem.status,
      code: problem.code,
      detail: problem.detail,
      requestId: request.id,
    });
}

function titleFor(status: number): string {
  if (status === 400) return 'Bad Request';
  if (status === 401) return 'Unauthorized';
  if (status === 403) return 'Forbidden';
  if (status === 404) return 'Not Found';
  if (status === 409) return 'Conflict';
  if (status === 429) return 'Too Many Requests';
  if (status >= 500) return 'Internal Server Error';
  return 'Error';
}
