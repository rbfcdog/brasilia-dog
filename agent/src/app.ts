import { timingSafeEqual } from 'node:crypto';
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { z } from 'zod';
import {
  resumeRunRequestSchema,
  startRunRequestSchema,
} from './contracts.js';
import { chatRequestSchema } from './chat.js';
import { AgentError, toAgentError } from './errors.js';
import type { AgentService } from './service.js';
import type { StartRunRequest, ResumeRunRequest } from './contracts.js';

interface HttpAgentService {
  start(idempotencyKey: string, request: StartRunRequest): unknown | Promise<unknown>;
  get(runId: string): unknown | Promise<unknown>;
  resume(runId: string, idempotencyKey: string, request: ResumeRunRequest): unknown | Promise<unknown>;
  chat(request: Parameters<AgentService['chat']>[0]): ReturnType<AgentService['chat']>;
  listProducts(): ReturnType<AgentService['listProducts']>;
  list?(ownerId: string): unknown | Promise<unknown>;
  identity?(): unknown | Promise<unknown>;
}

const idempotencyKeySchema = z.string().uuid();

export function createApp({
  service,
  serviceToken,
}: {
  service: HttpAgentService;
  serviceToken: string;
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/v1/identity', async (_request, response) => {
    if (!service.identity) throw new AgentError('NOT_FOUND', 'Identity is unavailable.', 404);
    response.json({ ok: true, data: await service.identity() });
  });

  app.use('/v1', (request, _response, next) => {
    requireBearerToken(request, serviceToken);
    next();
  });

  app.post('/v1/agent-runs', async (request, response) => {
    const body = parseBody(startRunRequestSchema, request.body);
    const idempotencyKey = requireIdempotencyKey(request);
    const run = await service.start(idempotencyKey, body) as { runId: string; status: string };
    response.status(202).json({
      ok: true,
      data: { runId: run.runId, status: run.status },
    });
  });

  app.get('/v1/agent-runs', async (request, response) => {
    if (!service.list) throw new AgentError('NOT_FOUND', 'Run listing is unavailable.', 404);
    const parsedOwner = z.string().uuid().safeParse(request.query.ownerId);
    if (!parsedOwner.success) throw new AgentError('INVALID_REQUEST', 'ownerId must be a UUID.', 400);
    const ownerId = parsedOwner.data;
    response.json({ ok: true, data: { runs: await service.list(ownerId) } });
  });

  app.post('/v1/chat', async (request, response) => {
    const body = parseBody(chatRequestSchema, request.body);
    response.json({ ok: true, data: await service.chat(body) });
  });

  app.get('/v1/products', async (_request, response) => {
    response.json({ ok: true, data: { products: await service.listProducts() } });
  });

  app.get('/v1/agent-runs/:runId', async (request, response) => {
    const run = await service.get(requirePathParameter(request.params.runId, 'runId'));
    response.json({ ok: true, data: run });
  });

  app.post('/v1/agent-runs/:runId/resume', async (request, response) => {
    const body = parseBody(resumeRunRequestSchema, request.body);
    const idempotencyKey = requireIdempotencyKey(request);
    const run = await service.resume(
      requirePathParameter(request.params.runId, 'runId'),
      idempotencyKey,
      body,
    ) as { runId: string; status: string };
    response.status(202).json({
      ok: true,
      data: { runId: run.runId, status: run.status },
    });
  });

  app.use((_request, _response, next) => {
    next(new AgentError('NOT_FOUND', 'Route not found.', 404));
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const failure = error instanceof SyntaxError
      ? new AgentError('INVALID_JSON', 'The request body must be valid JSON.', 400)
      : toAgentError(error);
    response.status(failure.httpStatus).json({
      ok: false,
      error: { code: failure.code, message: failure.message },
    });
  };
  app.use(errorHandler);

  return app;
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AgentError('INVALID_REQUEST', 'The request body is invalid.', 400, {
      cause: result.error,
    });
  }
  return result.data;
}

function requireIdempotencyKey(request: Request): string {
  const result = idempotencyKeySchema.safeParse(request.header('Idempotency-Key'));
  if (!result.success) {
    throw new AgentError(
      'IDEMPOTENCY_KEY_INVALID',
      'Idempotency-Key must be a UUID.',
      400,
    );
  }
  return result.data;
}

function requirePathParameter(value: string | string[] | undefined, name: string): string {
  if (typeof value !== 'string' || !z.string().uuid().safeParse(value).success) {
    throw new AgentError('INVALID_REQUEST', `The ${name} path parameter is invalid.`, 400);
  }
  return value;
}

function requireBearerToken(request: Request, expectedToken: string): void {
  const authorization = request.header('Authorization');
  const prefix = 'Bearer ';
  if (!authorization?.startsWith(prefix)) {
    throw new AgentError('UNAUTHORIZED', 'A valid bearer token is required.', 401);
  }

  const received = Buffer.from(authorization.slice(prefix.length), 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AgentError('UNAUTHORIZED', 'A valid bearer token is required.', 401);
  }
}
