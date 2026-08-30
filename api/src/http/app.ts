import { createHash } from 'node:crypto';

import type {
  AppHandler,
  MppHandler,
  PasskeySession,
  ProductCatalog,
  ProductPaymentService,
  ProductCatalogRepository,
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
import type { CrossCredentialAuth } from '../services/cross-credential-auth.js';
import type { SellerAgentVerificationService } from '../services/seller-agent-verification.js';
import type { SellerQuoteRepository } from '../repositories/seller-quote-repository.js';
import type { ConversationRepository } from '../repositories/conversation-repository.js';


function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAgentProof(value: unknown): value is PurchaseRequest['agentProof'] {
  if (!isRecord(value)) return false;

  return (
    typeof value.agentId === 'string' &&
    typeof value.agentKeyId === 'string' &&
    typeof value.bodySha256 === 'string' &&
    typeof value.expiresAt === 'number' &&
    typeof value.issuedAt === 'number' &&
    typeof value.mandateId === 'string' &&
    typeof value.mandateVersion === 'number' &&
    typeof value.method === 'string' &&
    typeof value.nonce === 'string' &&
    typeof value.path === 'string' &&
    typeof value.signature === 'string'
  );
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
    '/v1/seller/quote-requests': {
      post: {
        summary: 'Create a bounded seller quote request',
        description: 'Requires a passkey bearer session, a valid Ed25519 agent proof, and a mandate sellerPriceDisclosure scope for the named merchant.',
        responses: {
          '201': { description: 'Seller quote request created' },
          '401': { description: 'Passkey session or agent proof failed' },
          '403': { description: 'Seller is not authorized by the mandate disclosure scope' },
        },
      },
    },
    '/v1/seller/quote-requests/{id}': {
      get: {
        summary: 'Read a seller quote request',
        description: 'Requires an active seller integration API key in X-Merchant-Api-Key.',
        responses: {
          '200': { description: 'Seller-scoped agent verification hash and quote constraints' },
          '401': { description: 'Seller API key is missing' },
          '404': { description: 'Quote request is unknown, expired, or belongs to another seller' },
        },
      },
    },
    '/v1/seller/quote-requests/{id}/verify': {
      post: {
        summary: 'Verify seller-scoped agent evidence',
        description: 'Requires an active seller integration API key in X-Merchant-Api-Key.',
        responses: {
          '200': { description: 'Seller-scoped agent evidence verification result' },
          '401': { description: 'Seller API key or verification hash is missing' },
          '404': { description: 'Quote request is unknown, expired, or belongs to another seller' },
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
    '/v1/conversations': {
      post: {
        summary: 'Create an owner-scoped chat conversation',
        responses: {
          '201': { description: 'Conversation created' },
          '401': { description: 'Passkey session is required' },
        },
      },
      get: {
        summary: 'List conversations (passkey session or agent service token)',
        responses: {
          '200': { description: 'Conversations ordered by recent activity' },
          '401': { description: 'Passkey session or agent service token is required' },
        },
      },
    },
    '/v1/agent/products': {
      get: {
        summary: 'List the complete Stripe MPP product catalog for the agent service',
        responses: {
          '200': { description: 'Current products, offerings, and MPP endpoint state' },
          '401': { description: 'Agent service token is required' },
        },
      },
    },
    '/v1/conversations/{id}/messages': {
      get: {
        summary: 'Read a conversation transcript (passkey session or agent service token)',
        responses: {
          '200': { description: 'Messages in chronological order' },
          '401': { description: 'Passkey session or agent service token is required' },
          '404': { description: 'Conversation not found' },
        },
      },
      post: {
        summary: 'Persist one conversation message',
        responses: {
          '201': { description: 'Message persisted' },
          '400': { description: 'Invalid message payload' },
          '401': { description: 'Passkey session is required' },
          '404': { description: 'Conversation not found' },
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
  productRepository?: ProductCatalogRepository | null;
  agentIdentityRepository?: AgentIdentityRepository | null;
  mandateRepository?: MandateRepository | null;
  conversationRepository?: ConversationRepository | null;
  paymentHistoryRepository?: PaymentHistoryRepository | null;
  purchaseService?: PurchaseService | null;
  crossCredentialAuth?: CrossCredentialAuth | null;
  sellerAgentVerificationService?: SellerAgentVerificationService | null;
  sellerQuoteRepository?: SellerQuoteRepository | null;
  sessionService?: SessionService | null;
  agentServiceToken?: string | null;
}

export function createApp({
  paidHandler,
  productCatalogService = null,
  paymentService = null,
  passkeyService = null,
  refundService = null,
  productInfoRepository = null,
  productRepository = null,
  agentIdentityRepository = null,
  mandateRepository = null,
  paymentHistoryRepository = null,
  conversationRepository = null,
  purchaseService = null,
  crossCredentialAuth = null,
  sellerAgentVerificationService = null,
  sellerQuoteRepository = null,
  sessionService = null,
  agentServiceToken = null,
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
        const paymentHeaders = new Headers(request.headers);
        paymentHeaders.set('x-agent-execution-proof-id', authorization.executionProofId);
        const paymentRequest = new Request(request.url, {
          method: request.method,
          headers: paymentHeaders,
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
    // A dual-credential request can disclose an explicit mandate price limit to
    // one authorized seller. The seller receives only the derived agent hash,
    // never the passkey credential, biometric material, or owner identity.
    if (
      crossCredentialAuth &&
      sellerAgentVerificationService &&
      sellerQuoteRepository &&
      purchaseService &&
      request.method === 'POST' &&
      pathname === '/v1/seller/quote-requests'
    ) {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }

      const body = await request.json().catch(() => null);
      if (
        !isRecord(body) ||
        typeof body.merchantId !== 'string' ||
        !isRecord(body.intent) ||
        !isAgentProof(body.agentProof)
      ) {
        return json({ error: 'merchantId, intent, and agentProof are required' }, 400);
      }

      const priceLimitMinor = body.intent.priceLimitMinor;
      const requirements = Array.isArray(body.intent.requirements) ? body.intent.requirements : [];
      if (
        typeof priceLimitMinor !== 'number' ||
        !Number.isSafeInteger(priceLimitMinor) ||
        !requirements.every((item) => typeof item === 'string')
      ) {
        return json({ error: 'intent.priceLimitMinor and string requirements are required' }, 400);
      }

      try {
        const canonicalIntent = canonicalJson(body.intent);
        const authorization = await crossCredentialAuth.authorize({
          sessionToken: session.token,
          agentProof: body.agentProof,
          method: request.method,
          path: pathname,
          body: canonicalIntent,
        });
        crossCredentialAuth.checkSellerPriceDisclosure(
          authorization.mandate,
          body.merchantId,
          priceLimitMinor,
          requirements,
        );
        await purchaseService.recordProofForAuthorization(
          authorization,
          request.method,
          pathname,
          canonicalIntent,
          body.agentProof,
        );

        const expiresAt = new Date(Math.min(
          new Date(authorization.mandate.expiresAt).getTime(),
          Date.now() + 24 * 60 * 60 * 1000,
        )).toISOString();
        const verification = sellerAgentVerificationService.issue({
          userId: authorization.session.userId,
          passkeyCredentialId: authorization.session.credentialId,
          agentIdentityId: authorization.agent.id,
          mandateId: authorization.mandate.id,
          merchantId: body.merchantId,
          expiresAt,
        });
        const quoteRequest = await sellerQuoteRepository.create({
          merchantId: body.merchantId,
          ownerId: authorization.session.userId,
          agentIdentityId: authorization.agent.id,
          mandateId: authorization.mandate.id,
          credentialCommitment: verification.credentialCommitment,
          agentVerificationHash: verification.agentVerificationHash,
          priceLimitMinor,
          currency: authorization.mandate.currency,
          requirements,
          expiresAt,
        });

        return json({
          quoteRequest: {
            id: quoteRequest.id,
            merchantId: quoteRequest.merchantId,
            priceLimitMinor: quoteRequest.priceLimitMinor,
            currency: quoteRequest.currency,
            requirements: quoteRequest.requirements,
            expiresAt: quoteRequest.expiresAt,
          },
        }, 201);
      } catch (error) {
        const message = (error as Error).message;
        const status = message.includes('Mandate') || message.includes('mandate') || message.includes('Seller')
          ? 403
          : 401;
        return json({ error: 'seller_disclosure_denied', detail: message }, status);
      }
    }

    if (
      sellerQuoteRepository &&
      request.method === 'GET' &&
      /^\/v1\/seller\/quote-requests\/[^/]+$/.test(pathname)
    ) {
      const merchantApiKey = request.headers.get('x-merchant-api-key');
      const quoteRequestId = pathname.split('/')[4];
      if (!merchantApiKey || !quoteRequestId) {
        return json({ error: 'seller_authentication_required' }, 401);
      }
      const quoteRequest = await sellerQuoteRepository.getForSeller(merchantApiKey, quoteRequestId);
      if (!quoteRequest) {
        return json({ error: 'seller_quote_request_not_found' }, 404);
      }
      return json({
        quoteRequest: {
          id: quoteRequest.id,
          agentVerificationHash: quoteRequest.agentVerificationHash,
          priceLimitMinor: quoteRequest.priceLimitMinor,
          currency: quoteRequest.currency,
          requirements: quoteRequest.requirements,
          expiresAt: quoteRequest.expiresAt,
        },
      });
    }

    if (
      sellerQuoteRepository &&
      sellerAgentVerificationService &&
      request.method === 'POST' &&
      /^\/v1\/seller\/quote-requests\/[^/]+\/verify$/.test(pathname)
    ) {
      const merchantApiKey = request.headers.get('x-merchant-api-key');
      const quoteRequestId = pathname.split('/')[4];
      const body = await request.json().catch(() => null);
      if (!merchantApiKey || !quoteRequestId || !isRecord(body) || typeof body.agentVerificationHash !== 'string') {
        return json({ error: 'seller_authentication_and_agent_verification_hash_required' }, 401);
      }
      const quoteRequest = await sellerQuoteRepository.getForSeller(merchantApiKey, quoteRequestId);
      if (!quoteRequest) {
        return json({ error: 'seller_quote_request_not_found' }, 404);
      }
      const valid = sellerAgentVerificationService.verify({
        userId: quoteRequest.ownerId,
        credentialCommitment: quoteRequest.credentialCommitment,
        agentIdentityId: quoteRequest.agentIdentityId,
        mandateId: quoteRequest.mandateId,
        merchantId: quoteRequest.merchantId,
        expiresAt: quoteRequest.expiresAt,
      }, body.agentVerificationHash);
      return json({ valid });
    }


    if (productRepository && agentServiceToken && request.method === 'GET' && pathname === '/v1/agent/products') {
      const authorization = request.headers.get('authorization');
      const match = authorization?.match(/^Bearer (.+)$/);
      if (!match || match[1] !== agentServiceToken) {
        return json({ error: 'agent_authentication_required' }, 401);
      }
      try {
        return json({ products: await productRepository.listCatalog() });
      } catch {
        return json({ error: 'product_catalog_unavailable' }, 500);
      }
    }

    // Agent-accessible conversation read route. Authenticated by AGENT_SERVICE_TOKEN bearer.
    // The agent reads conversation history to contextualize its reasoning without
    // accessing passkey credentials or owner-private data.
    if (
      conversationRepository &&
      agentServiceToken &&
      request.method === 'GET' &&
      /^\/v1\/conversations\/[^/]+\/messages$/.test(pathname)
    ) {
      const authorization = request.headers.get('authorization');
      const match = authorization?.match(/^Bearer (.+)$/);
      if (!match || match[1] !== agentServiceToken) {
        return json({ error: 'agent_authentication_required' }, 401);
      }
      const conversationId = pathname.split('/')[3];
      if (!conversationId) {
        return json({ error: 'conversation_id_required' }, 400);
      }
      const conversation = await conversationRepository.getConversation(conversationId);
      if (!conversation) {
        return json({ error: 'conversation_not_found' }, 404);
      }
      try {
        const messages = await conversationRepository.listMessages(conversation.id);
        return json({
          conversation: {
            id: conversation.id,
            ownerId: conversation.ownerId,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
          },
          messages,
        });
      } catch {
        return json({ error: 'conversation_messages_unavailable' }, 500);
      }
    }

    // Agent-accessible conversation list route. Authenticated by AGENT_SERVICE_TOKEN bearer.
    if (
      conversationRepository &&
      agentServiceToken &&
      request.method === 'GET' &&
      pathname === '/v1/conversations'
    ) {
      const authorization = request.headers.get('authorization');
      const match = authorization?.match(/^Bearer (.+)$/);
      if (!match || match[1] !== agentServiceToken) {
        return json({ error: 'agent_authentication_required' }, 401);
      }
      const userId = new URL(request.url).searchParams.get('userId');
      if (!userId) {
        return json({ error: 'userId query parameter is required' }, 400);
      }
      try {
        return json({ conversations: await conversationRepository.listConversations(userId) });
      } catch {
        return json({ error: 'conversation_list_failed' }, 500);
      }
    }

    // Conversation routes. The passkey-authenticated owner owns every read and write.
    if (conversationRepository && request.method === 'POST' && pathname === '/v1/conversations') {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      try {
        const conversation = await conversationRepository.createConversation(session.userId);
        return json({ conversation }, 201);
      } catch {
        return json({ error: 'conversation_creation_failed' }, 500);
      }
    }

    if (conversationRepository && request.method === 'GET' && pathname === '/v1/conversations') {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      try {
        return json({ conversations: await conversationRepository.listConversations(session.userId) });
      } catch {
        return json({ error: 'conversation_list_failed' }, 500);
      }
    }

    if (
      conversationRepository &&
      /^\/v1\/conversations\/[^/]+\/messages$/.test(pathname) &&
      (request.method === 'GET' || request.method === 'POST')
    ) {
      const session = await authenticatedSession(request, sessionService);
      if (!session) {
        return json({ error: 'authentication_required' }, 401);
      }
      const conversationId = pathname.split('/')[3];
      if (!conversationId) {
        return json({ error: 'conversation_id_required' }, 400);
      }
      const conversation = await conversationRepository.getConversation(conversationId);
      if (!conversation || conversation.ownerId !== session.userId) {
        return json({ error: 'conversation_not_found' }, 404);
      }
      if (request.method === 'GET') {
        try {
          return json({ messages: await conversationRepository.listMessages(conversation.id) });
        } catch {
          return json({ error: 'conversation_messages_unavailable' }, 500);
        }
      }

      const body = await request.json().catch(() => null);
      if (
        !isRecord(body) ||
        (body.role !== 'user' && body.role !== 'assistant') ||
        typeof body.content !== 'string' ||
        typeof body.createdAt !== 'string' ||
        Number.isNaN(Date.parse(body.createdAt))
      ) {
        return json({ error: 'role, content, and createdAt are required' }, 400);
      }
      const content = body.content.trim();
      if (content.length === 0 || content.length > 16_000) {
        return json({ error: 'content must contain between 1 and 16000 characters' }, 400);
      }
      try {
        const message = await conversationRepository.appendMessage({
          ownerId: session.userId,
          conversationId: conversation.id,
          role: body.role,
          content,
          createdAt: body.createdAt,
        });
        return json({ message }, 201);
      } catch {
        return json({ error: 'conversation_message_persistence_failed' }, 500);
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
