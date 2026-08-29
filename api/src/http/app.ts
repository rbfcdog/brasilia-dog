import { createHash } from 'node:crypto';

import type {
  AppHandler,
  MppHandler,
  PasskeySession,
  ProductCatalog,
  ProductPaymentService,
} from '../domain/types.js';

import type { PasskeyService } from '../services/passkey-service.js';
import type { RefundService } from '../services/refund-service.js';
import type { ProductInfoRepository } from '../repositories/product-info-repository.js';
import type { AgentIdentityRepository } from '../repositories/agent-identity-repository.js';
import type { MandateRepository } from '../repositories/mandate-repository.js';
import type { PaymentHistoryRepository } from '../repositories/payment-history-repository.js';
import type { PurchaseRequest, PurchaseService } from '../services/purchase-service.js';
import type { SessionService } from '../services/session-service.js';
import { canonicalJson } from '../services/canonical-json.js';

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

async function authenticatedSession(
  request: Request,
  sessionService: SessionService | null,
): Promise<PasskeySession | null> {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer (.+)$/);
  if (!match || !sessionService) {
    return null;
  }

  return sessionService.verifySession(match[1]!);
}

const OPENAPI_DOCUMENT = Object.freeze({
  openapi: '3.1.0',
  info: {
    title: 'Stripe MPP sandbox API',
    version: '0.3.0',
    description: 'A controlled API that charges agents for resources using Stripe MPP, with passkey verification, agent identity, mandates, cross-credential authorization, refund support, and payment history.',
  },
  paths: {
    '/paid': {
      get: {
        summary: 'Controlled paid resource',
        description: 'Returns a paid resource after a 0.50 USD Stripe MPP payment.',
        'x-payment-info': {
          amount: '50',
          currency: 'usd',
          methods: ['stripe'],
        },
        responses: {
          '200': { description: 'Paid resource returned with receipt' },
          '402': { description: 'Payment required, returns WWW-Authenticate: Payment challenge' },
        },
      },
    },
    '/passkey/register/options': {
      post: {
        summary: 'Generate WebAuthn registration options',
        responses: {
          '200': { description: 'Registration options for a passkey authenticator' },
        },
      },
    },
    '/passkey/register/verify': {
      post: {
        summary: 'Verify a WebAuthn registration response',
        responses: {
          '200': { description: 'Registration verified, credential stored' },
          '400': { description: 'Registration verification failed' },
        },
      },
    },
    '/passkey/auth/options': {
      post: {
        summary: 'Generate WebAuthn authentication options',
        responses: {
          '200': { description: 'Authentication options for a registered passkey' },
        },
      },
    },
    '/passkey/auth/verify': {
      post: {
        summary: 'Verify a WebAuthn authentication assertion and return a session token',
        responses: {
          '200': { description: 'Authentication verified, session token returned' },
          '400': { description: 'Authentication verification failed' },
        },
      },
    },
    '/passkey/session/verify': {
      post: {
        summary: 'Verify a passkey session token',
        responses: {
          '200': { description: 'Session is valid' },
          '401': { description: 'Session is invalid or expired' },
        },
      },
    },
    '/passkey/session/revoke': {
      post: {
        summary: 'Revoke a passkey session token',
        responses: {
          '200': { description: 'Session revoked' },
        },
      },
    },
    '/refund': {
      post: {
        summary: 'Issue a Stripe refund for a payment intent',
        responses: {
          '200': { description: 'Refund created' },
          '400': { description: 'Invalid refund request' },
          '500': { description: 'Stripe refund failed' },
        },
      },
    },
    '/v1/products/{slug}/info': {
      get: {
        summary: 'Get product information by slug',
        responses: {
          '200': { description: 'Product details including metadata' },
          '404': { description: 'Product not found' },
        },
      },
    },
    '/v1/products/{slug}/purchase': {
      post: {
        summary: 'Initiate an agent purchase with cross-credential authorization',
        description: 'Requires both a passkey session token and an Ed25519 agent proof linked to a valid mandate.',
        responses: {
          '200': { description: 'Purchase challenge initiated or settled' },
          '401': { description: 'Cross-credential authorization failed' },
          '403': { description: 'Mandate scope or spend limit violated' },
          '404': { description: 'Product endpoint not found' },
        },
      },
    },
    '/v1/agents': {
      post: {
        summary: 'Register a new agent identity',
        responses: {
          '200': { description: 'Agent identity created with signing key' },
          '400': { description: 'Invalid request' },
        },
      },
      get: {
        summary: 'List agent identities for an owner',
        responses: {
          '200': { description: 'List of agent identities' },
        },
      },
    },
    '/v1/agents/{id}': {
      get: {
        summary: 'Get a single agent identity',
        responses: {
          '200': { description: 'Agent identity details' },
          '404': { description: 'Agent not found' },
        },
      },
    },
    '/v1/agents/{id}/status': {
      patch: {
        summary: 'Update agent identity status (active, suspended, revoked)',
        responses: {
          '200': { description: 'Status updated' },
          '400': { description: 'Invalid status' },
          '404': { description: 'Agent not found' },
        },
      },
    },
    '/v1/agents/{id}/activity': {
      get: {
        summary: 'List execution proof activity for an agent',
        responses: {
          '200': { description: 'List of execution proofs' },
          '404': { description: 'Agent not found' },
        },
      },
    },
    '/v1/mandates': {
      post: {
        summary: 'Create a mandate for an agent',
        responses: {
          '200': { description: 'Mandate created' },
          '400': { description: 'Invalid mandate parameters' },
        },
      },
      get: {
        summary: 'List mandates for an owner',
        responses: {
          '200': { description: 'List of mandates' },
        },
      },
    },
    '/v1/mandates/{id}': {
      get: {
        summary: 'Get a single mandate',
        responses: {
          '200': { description: 'Mandate details' },
          '404': { description: 'Mandate not found' },
        },
      },
    },
    '/v1/mandates/{id}/revoke': {
      post: {
        summary: 'Revoke a mandate',
        responses: {
          '200': { description: 'Mandate revoked' },
          '404': { description: 'Mandate not found' },
        },
      },
    },
    '/v1/payments': {
      get: {
        summary: 'List recent payment attempts',
        responses: {
          '200': { description: 'List of payment attempts' },
        },
      },
    },
    '/v1/payments/{id}': {
      get: {
        summary: 'Get a single payment attempt',
        responses: {
          '200': { description: 'Payment attempt details' },
          '404': { description: 'Payment attempt not found' },
        },
      },
    },
  },
});

interface AppDeps {
  paidHandler: MppHandler;
  productCatalogService?: ProductCatalog | null;
  paymentService?: ProductPaymentService | null;
  passkeyService?: PasskeyService | null;
  refundService?: RefundService | null;
  productInfoRepository?: ProductInfoRepository | null;
  agentIdentityRepository?: AgentIdentityRepository | null;
  mandateRepository?: MandateRepository | null;
  paymentHistoryRepository?: PaymentHistoryRepository | null;
  purchaseService?: PurchaseService | null;
  sessionService?: SessionService | null;
}

export function createApp({
  paidHandler,
  productCatalogService = null,
  paymentService = null,
  passkeyService = null,
  refundService = null,
  productInfoRepository = null,
  agentIdentityRepository = null,
  mandateRepository = null,
  paymentHistoryRepository = null,
  purchaseService = null,
  sessionService = null,
}: AppDeps): AppHandler {
  return async function app(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'GET' && pathname === '/health') {
      return json({ status: 'ok' });
    }

    if (request.method === 'GET' && pathname === '/openapi.json') {
      return json(OPENAPI_DOCUMENT);
    }

    if (request.method === 'GET' && pathname === '/paid') {
      return paidHandler(request);
    }

    // Passkey routes
    if (passkeyService && request.method === 'POST' && pathname === '/passkey/register/options') {
      const body = await request.json().catch(() => ({})) as { userId?: string; username?: string };
      if (!body.userId || !body.username) {
        return json({ error: 'userId and username are required' }, 400);
      }
      const options = await passkeyService.generateRegistration(body.userId, body.username);
      return json(options);
    }

    if (passkeyService && request.method === 'POST' && pathname === '/passkey/register/verify') {
      const body = await request.json().catch(() => ({})) as { userId?: string; response?: unknown };
      if (!body.userId || !body.response) {
        return json({ error: 'userId and response are required' }, 400);
      }
      try {
        const result = await passkeyService.verifyRegistration(body.userId, body.response);
        return json({ verified: result.verified, ...(result.credentialId ? { credentialId: result.credentialId } : {}) });
      } catch (err) {
        return json({ error: 'registration_failed', detail: (err as Error).message }, 400);
      }
    }

    if (passkeyService && request.method === 'POST' && pathname === '/passkey/auth/options') {
      const body = await request.json().catch(() => ({})) as { userId?: string };
      if (!body.userId) {
        return json({ error: 'userId is required' }, 400);
      }
      const options = await passkeyService.generateAuthentication(body.userId);
      return json(options);
    }

    if (passkeyService && request.method === 'POST' && pathname === '/passkey/auth/verify') {
      const body = await request.json().catch(() => ({})) as { userId?: string; response?: unknown };
      if (!body.userId || !body.response) {
        return json({ error: 'userId and response are required' }, 400);
      }
      try {
        const result = await passkeyService.verifyAuthentication(body.userId, body.response);
        return json(result);
      } catch (err) {
        return json({ error: 'authentication_failed', detail: (err as Error).message }, 400);
      }
    }

    // Session verification routes
    if (sessionService && request.method === 'POST' && pathname === '/passkey/session/verify') {
      const body = await request.json().catch(() => ({})) as { sessionToken?: string };
      if (!body.sessionToken) {
        return json({ error: 'sessionToken is required' }, 400);
      }
      const session = await sessionService.verifySession(body.sessionToken);
      if (!session) {
        return json({ error: 'session_invalid' }, 401);
      }
      return json({ valid: true, userId: session.userId, expiresAt: session.expiresAt });
    }

    if (sessionService && request.method === 'POST' && pathname === '/passkey/session/revoke') {
      const body = await request.json().catch(() => ({})) as { sessionToken?: string };
      if (!body.sessionToken) {
        return json({ error: 'sessionToken is required' }, 400);
      }
      await sessionService.revokeSession(body.sessionToken);
      return json({ revoked: true });
    }

    // Refund route
    if (refundService && request.method === 'POST' && pathname === '/refund') {
      const body = await request.json().catch(() => ({})) as { paymentIntentId?: string; amount?: number; reason?: string };
      if (!body.paymentIntentId) {
        return json({ error: 'paymentIntentId is required' }, 400);
      }
      try {
        const result = await refundService.refund({
          paymentIntentId: body.paymentIntentId,
          ...(body.amount ? { amount: body.amount } : {}),
          ...(body.reason ? { reason: body.reason as 'duplicate' | 'fraudulent' | 'requested_by_customer' } : {}),
        });
        return json(result);
      } catch (err) {
        return json({ error: 'refund_failed', detail: (err as Error).message }, 500);
      }
    }

    // Product info route: /v1/products/:slug/info
    if (productInfoRepository && request.method === 'GET' && pathname.startsWith('/v1/products/') && pathname.endsWith('/info')) {
      const parts = pathname.split('/');
      const slug = parts[3];
      if (!slug) {
        return json({ error: 'product slug is required' }, 400);
      }
      const product = await productInfoRepository.findBySlug(slug);
      if (!product) {
        return json({ error: 'product_not_found' }, 404);
      }
      return json({ product });
    }

    // Agent purchase route: POST /v1/products/:slug/purchase
    if (purchaseService && request.method === 'POST' && pathname.startsWith('/v1/products/') && pathname.endsWith('/purchase')) {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      if (!paymentService) {
        return json({ error: 'payment_rail_unavailable' }, 503);
      }
      const slug = pathname.split('/')[3];
      if (!slug) {
        return json({ error: 'product slug is required' }, 400);
      }
      const rawBody = await request.text();
      let body: { intent?: unknown; agentProof?: PurchaseRequest['agentProof'] };
      try {
        body = JSON.parse(rawBody || '{}') as { intent?: unknown; agentProof?: PurchaseRequest['agentProof'] };
      } catch {
        return json({ error: 'invalid_json' }, 400);
      }
      if (body.intent === undefined || !body.agentProof) {
        return json({ error: 'intent and agentProof are required' }, 400);
      }
      try {
        const authorization = await purchaseService.authorizePurchase(
          slug,
          request.method,
          pathname,
          canonicalJson(body.intent),
          { sessionToken: session.token, agentProof: body.agentProof },
        );
        const paymentRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: rawBody,
        });
        const response = await paymentService.serve(authorization.endpoint, paymentRequest);
        response.headers.set('x-agent-execution-proof-id', authorization.executionProofId);
        return response;
      } catch (err) {
        const message = (err as Error).message;
        if (message.includes('session') || message.includes('proof') || message.includes('Agent identity') || message.includes('signing key')) {
          return json({ error: 'authorization_denied', detail: message }, 401);
        }
        if (message.includes('mandate') || message.includes('scope') || message.includes('amount') || message.includes('expired')) {
          return json({ error: 'mandate_violation', detail: message }, 403);
        }
        if (message.includes('not found') || message.includes('not enabled')) {
          return json({ error: 'product_endpoint_not_found', detail: message }, 404);
        }
        return json({ error: 'purchase_failed', detail: message }, 500);
      }
    }

    // Agent identity routes. Every route is scoped to the passkey-authenticated owner.
    if (agentIdentityRepository && request.method === 'POST' && pathname === '/v1/agents') {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      const body = await request.json().catch(() => ({})) as { displayName?: string; publicKeyJwk?: JsonWebKey };
      if (!body.displayName || !body.publicKeyJwk) {
        return json({ error: 'displayName and publicKeyJwk are required' }, 400);
      }
      try {
        const identity = await agentIdentityRepository.createIdentity(session.userId, body.displayName);
        const fingerprint = createHash('sha256').update(JSON.stringify(body.publicKeyJwk)).digest('hex');
        const key = await agentIdentityRepository.addSigningKey(
          identity.id,
          body.publicKeyJwk,
          fingerprint,
          `agent-key-${identity.id}`,
        );
        return json({ identity, signingKey: { id: key.id, algorithm: key.algorithm, fingerprint: key.publicKeyFingerprint } });
      } catch (err) {
        return json({ error: 'agent_creation_failed', detail: (err as Error).message }, 400);
      }
    }

    if (agentIdentityRepository && request.method === 'GET' && pathname === '/v1/agents') {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      const identities = await agentIdentityRepository.listIdentities(session.userId);
      return json({ agents: identities });
    }

    // Agent identity: GET /v1/agents/:id
    if (agentIdentityRepository && request.method === 'GET' && pathname.startsWith('/v1/agents/') && !pathname.includes('/status') && !pathname.includes('/activity')) {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      const id = pathname.split('/')[3];
      if (!id) {
        return json({ error: 'agent id is required' }, 400);
      }
      const identity = await agentIdentityRepository.getIdentity(id);
      if (!identity || identity.ownerId !== session.userId) {
        return json({ error: 'agent_not_found' }, 404);
      }
      return json({ agent: identity });
    }

    // Agent identity status: PATCH /v1/agents/:id/status
    if (agentIdentityRepository && request.method === 'PATCH' && pathname.startsWith('/v1/agents/') && pathname.endsWith('/status')) {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      const id = pathname.split('/')[3];
      if (!id) {
        return json({ error: 'agent id is required' }, 400);
      }
      const body = await request.json().catch(() => ({})) as { status?: string };
      const validStatuses = ['active', 'suspended', 'revoked'];
      if (!body.status || !validStatuses.includes(body.status)) {
        return json({ error: 'status must be one of: active, suspended, revoked' }, 400);
      }
      const identity = await agentIdentityRepository.getIdentity(id);
      if (!identity || identity.ownerId !== session.userId) {
        return json({ error: 'agent_not_found' }, 404);
      }
      await agentIdentityRepository.updateStatus(id, body.status as 'active' | 'suspended' | 'revoked');
      return json({ id, status: body.status });
    }

    // Agent activity: GET /v1/agents/:id/activity
    if (paymentHistoryRepository && request.method === 'GET' && pathname.startsWith('/v1/agents/') && pathname.endsWith('/activity')) {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      const id = pathname.split('/')[3];
      if (!id) {
        return json({ error: 'agent id is required' }, 400);
      }
      if (!agentIdentityRepository) {
        return json({ error: 'agent_identity_unavailable' }, 503);
      }
      const identity = await agentIdentityRepository.getIdentity(id);
      if (!identity || identity.ownerId !== session.userId) {
        return json({ error: 'agent_not_found' }, 404);
      }
      const activity = await paymentHistoryRepository.listAgentActivity(id);
      return json({ activity });
    }

    // Mandate routes. An authenticated user can manage only mandates for agents they own.
    if (mandateRepository && request.method === 'POST' && pathname === '/v1/mandates') {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      const body = await request.json().catch(() => ({})) as {
        agentIdentityId?: string;
        scope?: Record<string, unknown>;
        maxAmountMinor?: number;
        currency?: string;
        expiresAt?: string;
      };
      if (!body.agentIdentityId || !body.maxAmountMinor || !body.currency || !body.expiresAt) {
        return json({ error: 'agentIdentityId, maxAmountMinor, currency, and expiresAt are required' }, 400);
      }
      if (!agentIdentityRepository) {
        return json({ error: 'agent_identity_unavailable' }, 503);
      }
      const agent = await agentIdentityRepository.getIdentity(body.agentIdentityId);
      if (!agent || agent.ownerId !== session.userId) {
        return json({ error: 'agent_not_found' }, 404);
      }
      try {
        const mandate = await mandateRepository.create({
          ownerId: session.userId,
          agentIdentityId: body.agentIdentityId,
          scope: body.scope ?? {},
          maxAmountMinor: body.maxAmountMinor,
          currency: body.currency,
          expiresAt: body.expiresAt,
        });
        return json({ mandate });
      } catch (err) {
        return json({ error: 'mandate_creation_failed', detail: (err as Error).message }, 400);
      }
    }

    if (mandateRepository && request.method === 'GET' && pathname === '/v1/mandates') {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      const mandates = await mandateRepository.listMandates(session.userId);
      return json({ mandates });
    }

    // Mandate: GET /v1/mandates/:id
    if (mandateRepository && request.method === 'GET' && pathname.startsWith('/v1/mandates/') && !pathname.endsWith('/revoke')) {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      const id = pathname.split('/')[3];
      if (!id) {
        return json({ error: 'mandate id is required' }, 400);
      }
      const mandate = await mandateRepository.getMandate(id);
      if (!mandate || mandate.ownerId !== session.userId) {
        return json({ error: 'mandate_not_found' }, 404);
      }
      return json({ mandate });
    }

    // Mandate revoke: POST /v1/mandates/:id/revoke
    if (mandateRepository && request.method === 'POST' && pathname.startsWith('/v1/mandates/') && pathname.endsWith('/revoke')) {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      const id = pathname.split('/')[3];
      if (!id) {
        return json({ error: 'mandate id is required' }, 400);
      }
      const mandate = await mandateRepository.getMandate(id);
      if (!mandate || mandate.ownerId !== session.userId) {
        return json({ error: 'mandate_not_found' }, 404);
      }
      await mandateRepository.revoke(id);
      return json({ id, status: 'revoked' });
    }

    // Payment history is scoped to payment attempts linked to the authenticated owner's mandates.
    if (paymentHistoryRepository && request.method === 'GET' && pathname === '/v1/payments') {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      const attempts = await paymentHistoryRepository.listPaymentAttempts(session.userId);
      return json({ payments: attempts });
    }

    if (paymentHistoryRepository && request.method === 'GET' && pathname.startsWith('/v1/payments/')) {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      const id = pathname.split('/')[3];
      if (!id) {
        return json({ error: 'payment id is required' }, 400);
      }
      const attempt = await paymentHistoryRepository.getPaymentAttempt(session.userId, id);
      if (!attempt) {
        return json({ error: 'payment_not_found' }, 404);
      }
      return json({ payment: attempt });
    }

    // Catalog-backed paid endpoints
    if (productCatalogService && paymentService) {
      const endpoint = await productCatalogService.resolve(request);
      if (endpoint) {
        return paymentService.serve(endpoint, request);
      }
    }

    return json({ error: 'not_found' }, 404);
  };
}
