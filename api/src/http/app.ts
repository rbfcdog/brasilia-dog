import { createHash, randomBytes } from 'node:crypto';

import type {
  AppHandler,
  MppHandler,
  PasskeySession,
  ProductCatalog,
  ProductPaymentService,
  ProductCatalogRepository,
  ProductCatalogSearch,
  MandateScope,
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
import { MerchantCommandError, type MerchantService } from '../services/merchant-service.js';
import type { UserAuthService } from '../services/user-auth-service.js';
import type { PasskeyEnrollmentAuthority } from '../services/passkey-enrollment-service.js';
import { BackendChatError, type BackendChatService } from '../services/backend-chat-service.js';
import type { MarketplaceAuthorityService } from '../services/marketplace-authority-service.js';
import { parseMarketplaceScope } from '../services/marketplace-policy.js';


function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function validCpf(value: string): boolean {
  const cpf = digits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const checkDigit = (length: number): number => {
    const sum = [...cpf.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10]);
}

function validCnpj(value: string): boolean {
  const cnpj = digits(value);
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const checkDigit = (length: number): number => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = [...cnpj.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * weights[index]!, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return checkDigit(12) === Number(cnpj[12]) && checkDigit(13) === Number(cnpj[13]);
}

const conversationEventTypes = new Set([
  'catalog_search',
  'category_list',
  'product_comparison',
  'agent_response',
  'mandate_proposed',
  'passkey_approved',
  'mandate_activated',
  'payment_executed',
  'payment_failed',
]);

function parseConversationEvent(body: unknown): {
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
} | null {
  if (
    !isRecord(body)
    || typeof body.type !== 'string'
    || !conversationEventTypes.has(body.type)
    || !isRecord(body.payload)
    || Array.isArray(body.payload)
    || typeof body.createdAt !== 'string'
    || Number.isNaN(Date.parse(body.createdAt))
  ) {
    return null;
  }
  const serializedPayload = JSON.stringify(body.payload);
  if (serializedPayload.length > 16_000) return null;
  return { type: body.type, payload: body.payload, createdAt: body.createdAt };
}

function idempotencyKey(request: Request): string | null {
  const value = request.headers.get('idempotency-key');
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function publicAgentJwk(value: unknown): JsonWebKey | null {
  if (!isRecord(value) || value.kty !== 'OKP' || value.crv !== 'Ed25519' || typeof value.x !== 'string' || 'd' in value) return null;
  return { kty: 'OKP', crv: 'Ed25519', x: value.x };
}

function parseProductCatalogSearch(value: unknown): ProductCatalogSearch | null {
  if (!isRecord(value)) return null;
  const query = value.query === undefined ? null : value.query;
  const category = value.category === undefined ? null : value.category;
  const rawMaximum = value.maximumAmountMinor ?? value.maximumAmount ?? null;
  const maximumAmountMinor = value.maximumAmountMinor === undefined && typeof value.maximumAmount === 'number'
    ? Math.round(value.maximumAmount * 100)
    : rawMaximum;
  const slugs = value.slugs === undefined ? [] : value.slugs;
  const limit = value.limit === undefined ? 3 : value.limit;
  if ((query !== null && typeof query !== 'string')
    || (category !== null && typeof category !== 'string')
    || (maximumAmountMinor !== null
      && (typeof maximumAmountMinor !== 'number' || !Number.isSafeInteger(maximumAmountMinor) || maximumAmountMinor < 0))
    || !Array.isArray(slugs)
    || slugs.length > 5
    || !slugs.every((slug) => typeof slug === 'string' && slug.length > 0)
    || typeof limit !== 'number'
    || !Number.isInteger(limit)
    || limit < 1
    || limit > 25) {
    return null;
  }
  return { query, category, maximumAmountMinor, slugs, limit };
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

async function authenticatedOwner(
  request: Request,
  sessionService: SessionService | null,
  authenticateSupabaseUser: ((token: string) => Promise<{ id: string; email?: string } | null>) | null,
): Promise<{ userId: string } | null> {
  const passkeySession = await authenticatedSession(request, sessionService);
  if (passkeySession) return { userId: passkeySession.userId };

  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer (.+)$/);
  if (!match || !authenticateSupabaseUser) return null;

  const user = await authenticateSupabaseUser(match[1]!);
  return user ? { userId: user.id } : null;
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
    '/v1/merchant/products': {
      post: {
        summary: 'Create an owned fixed-price product draft',
        description: 'Requires a Supabase user access token. The server derives product ownership and payment-network configuration.',
        responses: {
          '201': { description: 'Product draft, inactive offering, and disabled endpoint created atomically' },
          '401': { description: 'Merchant authentication required' },
          '409': { description: 'Product slug already exists' },
        },
      },
    },
    '/v1/merchant/products/{id}/publish': {
      post: {
        summary: 'Publish an owned fixed-price product draft',
        responses: {
          '200': { description: 'Product, offering, and endpoint activated atomically' },
          '404': { description: 'Owned publishable draft not found' },
        },
      },
    },
    '/v1/merchant/refund-cases': {
      post: {
        summary: 'Create a pending refund case',
        description: 'Records an operations request only. It does not call Stripe or authorize a refund.',
        responses: {
          '201': { description: 'Pending refund case created' },
          '404': { description: 'Owned settled payment attempt not found' },
          '409': { description: 'An open case already exists' },
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
    '/v1/agent/products/search': {
      post: {
        summary: 'Run a ranked, bounded marketplace query for the agent service',
        responses: {
          '200': { description: 'Ranked active Stripe MPP products' },
          '400': { description: 'Invalid search filters' },
          '401': { description: 'Agent service token is required' },
        },
      },
    },
    '/v1/agent/conversations/{id}/messages': {
      get: {
        summary: 'Read a conversation transcript for the agent service',
        responses: {
          '200': { description: 'Messages in chronological order' },
          '401': { description: 'Agent service token is required' },
          '404': { description: 'Conversation not found' },
        },
      },
    },
    '/v1/conversations/{id}/messages': {
      get: {
        summary: 'Read an owner-scoped conversation transcript',
        responses: {
          '200': { description: 'Messages in chronological order' },
          '401': { description: 'Owner session is required' },
          '404': { description: 'Conversation not found' },
        },
      },
      post: {
        summary: 'Persist one conversation message',
        responses: {
          '201': { description: 'Message persisted' },
          '400': { description: 'Invalid message payload' },
          '401': { description: 'Owner session is required' },
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
  backendChatService?: BackendChatService | null;
  paymentHistoryRepository?: PaymentHistoryRepository | null;
  purchaseService?: PurchaseService | null;
  crossCredentialAuth?: CrossCredentialAuth | null;
  sellerAgentVerificationService?: SellerAgentVerificationService | null;
  sellerQuoteRepository?: SellerQuoteRepository | null;
  sessionService?: SessionService | null;
  merchantService?: MerchantService | null;
  authenticateSupabaseUser?: ((token: string) => Promise<{ id: string; email?: string } | null>) | null;
  demoPasskeyEnabled?: boolean;
  agentServiceToken?: string | null;
  userAuthService?: UserAuthService | null;
  passkeyEnrollmentService?: PasskeyEnrollmentAuthority | null;
  marketplaceAuthorityService?: MarketplaceAuthorityService | null;
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
  backendChatService = null,
  purchaseService = null,
  crossCredentialAuth = null,
  sellerAgentVerificationService = null,
  sellerQuoteRepository = null,
  sessionService = null,
  demoPasskeyEnabled = false,
  agentServiceToken = null,
  merchantService = null,
  authenticateSupabaseUser = null,
  userAuthService = null,
  passkeyEnrollmentService = null,
  marketplaceAuthorityService = null,
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

    if (agentIdentityRepository && request.method === 'POST' && pathname === '/v1/agents/ensure') {
      const session = await authenticatedSession(request, sessionService);
      if (!session) return json({ error: 'authentication_required' }, 401);
      const body = await request.json().catch(() => null);
      if (!isRecord(body)) return json({ error: 'invalid_agent_identity' }, 400);
      const publicKeyJwk = publicAgentJwk(body.publicKeyJwk);
      if (!publicKeyJwk || typeof body.fingerprint !== 'string') return json({ error: 'invalid_agent_identity' }, 400);
      const fingerprint = createHash('sha256').update(canonicalJson(publicKeyJwk)).digest('hex');
      if (fingerprint !== body.fingerprint) return json({ error: 'agent_fingerprint_mismatch' }, 400);
      try {
        const ensured = await agentIdentityRepository.ensureIdentity({
          ownerId: session.userId,
          displayName: typeof body.displayName === 'string' ? body.displayName : 'Marketplace Agent',
          publicKeyJwk,
          fingerprint,
        });
        return json(ensured);
      } catch (error) {
        return json({ error: 'agent_ensure_failed', detail: (error as Error).message }, 400);
      }
    }


    if (userAuthService && request.method === 'POST' && pathname === '/v1/auth/sign-in') {
      const body = await request.json().catch(() => null);
      if (!isRecord(body) || typeof body.email !== 'string' || typeof body.password !== 'string') {
        return json({ error: 'email_and_password_required' }, 400);
      }
      try {
        return json({ session: await userAuthService.signIn(body.email.trim(), body.password) });
      } catch (error) {
        return json({ error: 'authentication_failed', detail: (error as Error).message }, 401);
      }
    }

    if (userAuthService && request.method === 'POST' && pathname === '/v1/auth/sign-up') {
      const body = await request.json().catch(() => null);
      if (
        !isRecord(body) ||
        typeof body.email !== 'string' ||
        typeof body.password !== 'string' ||
        typeof body.cpf !== 'string' ||
        (body.role !== 'buyer' && body.role !== 'merchant')
      ) {
        return json({ error: 'email_password_cpf_and_role_required' }, 400);
      }
      const cpf = digits(body.cpf);
      if (!validCpf(cpf)) return json({ error: 'cpf_invalid' }, 400);
      const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
      const cnpj = typeof body.cnpj === 'string' ? digits(body.cnpj) : '';
      if (body.role === 'merchant' && businessName.length < 2) {
        return json({ error: 'business_name_required' }, 400);
      }
      if (body.role === 'merchant' && !validCnpj(cnpj)) {
        return json({ error: 'cnpj_invalid' }, 400);
      }
      try {
        return json(await userAuthService.signUp(body.email.trim(), body.password, {
          account_type: body.role,
          cpf,
          ...(body.role === 'merchant' ? { business_name: businessName, cnpj } : {}),
        }), 201);
      } catch (error) {
        return json({ error: 'signup_failed', detail: (error as Error).message }, 400);
      }
    }
    if (userAuthService && request.method === 'POST' && pathname === '/v1/auth/refresh') {
      const body = await request.json().catch(() => null);
      if (!isRecord(body) || typeof body.refreshToken !== 'string') {
        return json({ error: 'refresh_token_required' }, 400);
      }
      try {
        return json({ session: await userAuthService.refresh(body.refreshToken) });
      } catch (error) {
        return json({ error: 'session_expired', detail: (error as Error).message }, 401);
      }
    }

    if (userAuthService && request.method === 'GET' && pathname === '/v1/auth/session') {
      const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
      const user = token ? await userAuthService.getUser(token) : null;
      return user ? json({ user }) : json({ error: 'authentication_required' }, 401);
    }

    if (
      passkeyEnrollmentService &&
      userAuthService &&
      request.method === 'POST' &&
      pathname === '/v1/passkey/enrollments'
    ) {
      const accessToken = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
      const user = accessToken ? await userAuthService.getUser(accessToken) : null;
      if (!user) return json({ error: 'authentication_required' }, 401);
      try {
        return json(await passkeyEnrollmentService.create(user.id), 201);
      } catch (err) {
        return json({ error: 'enrollment_unavailable', detail: (err as Error).message }, 503);
      }
    }

    if (
      passkeyEnrollmentService &&
      request.method === 'POST' &&
      pathname === '/v1/passkey/enrollments/claim'
    ) {
      const body = await request.json().catch(() => null);
      const token = isRecord(body) && typeof body.token === 'string' ? body.token : '';
      const grant = token ? await passkeyEnrollmentService.resolve(token) : null;
      return grant
        ? json({ valid: true, expiresAt: grant.expiresAt })
        : json({ error: 'enrollment_invalid_or_expired' }, 401);
    }

    if (
      passkeyService &&
      authenticateSupabaseUser &&
      request.method === 'GET' &&
      pathname === '/v1/passkeys/status'
    ) {
      const accessToken = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
      const user = accessToken ? await authenticateSupabaseUser(accessToken) : null;
      if (!user) return json({ error: 'authentication_required' }, 401);
      try {
        return json(await passkeyService.registrationStatus(user.id));
      } catch (err) {
        return json({ error: 'passkey_status_unavailable', detail: (err as Error).message }, 503);
      }
    }

    if (sessionService && request.method === 'POST' && pathname === '/passkey/demo/verify') {
      // Demo approval may be used by an existing account or as a standalone
      // demo. Preserve the account owner when a valid Supabase session exists.
      const accessToken = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
      const account = accessToken && authenticateSupabaseUser ? await authenticateSupabaseUser(accessToken) : null;
      const userId = account?.id ?? '00000000-0000-4000-8000-000000000001';
      const credentialId = `demo-passkey-${randomBytes(24).toString('base64url')}`;
      const session = await sessionService.createSession(userId, credentialId);
      return json({ verified: true, demo: true, credentialId, sessionToken: session.token });
    }
    // Passkey routes
    if (
      passkeyService &&
      authenticateSupabaseUser &&
      request.method === 'POST' &&
      /^\/passkey\/(?:register|auth)\/(?:options|verify)$/.test(pathname)
    ) {
      const enrollmentToken = request.headers.get('x-passkey-enrollment');
      const enrollment = enrollmentToken && passkeyEnrollmentService && /^\/passkey\/(?:register|auth)\//.test(pathname)
        ? await passkeyEnrollmentService.resolve(enrollmentToken)
        : null;
      const accessToken = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
      const accountUser = accessToken ? await authenticateSupabaseUser(accessToken) : null;
      const user = enrollment ? { id: enrollment.userId } : accountUser;
      if (!user) return json({ error: 'passkey_registration_authorization_required' }, 401);
      const body = await request.json().catch(() => ({})) as { response?: unknown };

      if (pathname === '/passkey/register/options') {
        try {
          return json(await passkeyService.generateRegistration(user.id, user.email ?? user.id));
        } catch (err) {
          return json({ error: 'passkey_registration_unavailable', detail: (err as Error).message }, 503);
        }
      }
      if (pathname === '/passkey/register/verify') {
        if (!body.response) return json({ error: 'response is required' }, 400);
        try {
          if (enrollmentToken && passkeyEnrollmentService) {
            const consumed = await passkeyEnrollmentService.consume(enrollmentToken, user.id);
            if (!consumed) return json({ error: 'enrollment_invalid_or_consumed' }, 401);
          }
          const result = await passkeyService.verifyRegistration(user.id, body.response);
          return json({ verified: result.verified, ...(result.credentialId ? { credentialId: result.credentialId } : {}) });
        } catch (err) {
          return json({ error: 'registration_failed', detail: (err as Error).message }, 400);
        }
      }
      if (pathname === '/passkey/auth/options') {
        try {
          return json(await passkeyService.generateAuthentication(user.id));
        } catch (err) {
          return json({ error: 'passkey_authentication_unavailable', detail: (err as Error).message }, 503);
        }
      }
      if (!body.response) return json({ error: 'response is required' }, 400);
      try {
        const result = await passkeyService.verifyAuthentication(user.id, body.response);
        if (enrollmentToken && passkeyEnrollmentService) {
          const consumed = await passkeyEnrollmentService.consume(enrollmentToken, user.id);
          if (!consumed) return json({ error: 'enrollment_invalid_or_consumed' }, 401);
        }
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
      return json({ valid: true, userId: session.userId, issuedAt: session.issuedAt, expiresAt: session.expiresAt });
    }

    if (sessionService && request.method === 'POST' && pathname === '/passkey/session/revoke') {
      const body = await request.json().catch(() => ({})) as { sessionToken?: string };
      if (!body.sessionToken) {
        return json({ error: 'sessionToken is required' }, 400);
      }
      await sessionService.revokeSession(body.sessionToken);
      return json({ revoked: true });
    }

    if (merchantService && request.method === 'GET' && pathname.startsWith('/v1/merchant/')) {
      try {
        const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
        if (!token) throw new MerchantCommandError('Merchant authentication is required.', 401, 'merchant_authentication_required');
        if (pathname === '/v1/merchant/session') return json(await merchantService.session(token));
        if (pathname === '/v1/merchant/dashboard') return json(await merchantService.dashboard(token));
        if (pathname === '/v1/merchant/orders') return json({ orders: await merchantService.projection(token, 'orders') });
        if (pathname === '/v1/merchant/catalog') return json({ products: await merchantService.projection(token, 'catalog') });
        if (pathname === '/v1/merchant/finance') return json(await merchantService.projection(token, 'finance'));
        const auditMatch = pathname.match(/^\/v1\/merchant\/orders\/([^/]+)\/audit$/);
        if (auditMatch) return json({ events: await merchantService.projection(token, 'orders', auditMatch[1]) });
      } catch (error) {
        const commandError = error instanceof MerchantCommandError ? error : new MerchantCommandError('Merchant data is unavailable.', 500);
        return json({ error: commandError.code, detail: commandError.message }, commandError.status);
      }
    }

    // Merchant commands accept a short-lived Supabase user JWT. The service
    // derives the owner from that verified token; request bodies never carry it.
    if (merchantService && request.method === 'POST' && pathname === '/v1/merchant/products') {
      try {
        const authorization = request.headers.get('authorization');
        const token = authorization?.match(/^Bearer (.+)$/)?.[1];
        if (!token) throw new MerchantCommandError('Merchant authentication is required.', 401, 'merchant_authentication_required');
        const user = await merchantService.authenticate(token);
        const body = await request.json().catch(() => ({}));
        const product = await merchantService.createProduct(user.id, isRecord(body) ? body : {});
        return json({ product }, 201);
      } catch (error) {
        const commandError = error instanceof MerchantCommandError ? error : new MerchantCommandError('Could not create the product draft.', 500, 'product_create_failed');
        return json({ error: commandError.code, detail: commandError.message }, commandError.status);
      }
    }

    if (merchantService && request.method === 'POST' && /^\/v1\/merchant\/products\/[^/]+\/publish$/.test(pathname)) {
      try {
        const authorization = request.headers.get('authorization');
        const token = authorization?.match(/^Bearer (.+)$/)?.[1];
        if (!token) throw new MerchantCommandError('Merchant authentication is required.', 401, 'merchant_authentication_required');
        const user = await merchantService.authenticate(token);
        const productId = pathname.split('/')[4];
        if (!productId) throw new MerchantCommandError('Product ID is required.');
        const product = await merchantService.publishProduct(user.id, productId);
        return json({ product });
      } catch (error) {
        const commandError = error instanceof MerchantCommandError ? error : new MerchantCommandError('Could not publish the product.', 500, 'product_publish_failed');
        return json({ error: commandError.code, detail: commandError.message }, commandError.status);
      }
    }

    if (merchantService && request.method === 'POST' && pathname === '/v1/merchant/refund-cases') {
      try {
        const authorization = request.headers.get('authorization');
        const token = authorization?.match(/^Bearer (.+)$/)?.[1];
        if (!token) throw new MerchantCommandError('Merchant authentication is required.', 401, 'merchant_authentication_required');
        const user = await merchantService.authenticate(token);
        const body = await request.json().catch(() => ({}));
        const refundCase = await merchantService.createRefundCase(user.id, isRecord(body) ? body : {});
        return json({ refundCase }, 201);
      } catch (error) {
        const commandError = error instanceof MerchantCommandError ? error : new MerchantCommandError('Could not create the refund case.', 500, 'refund_case_create_failed');
        return json({ error: commandError.code, detail: commandError.message }, commandError.status);
      }
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


    if (request.method === 'POST' && pathname === '/v1/chat') {
      if (!backendChatService) return json({ error: 'chat_gateway_unavailable' }, 503);
      const body = await request.json().catch(() => null);
      if (
        !isRecord(body) ||
        typeof body.message !== 'string' ||
        !body.message.trim() ||
        body.message.trim().length > 2_000 ||
        (body.conversationId !== undefined && (
          typeof body.conversationId !== 'string' ||
          !body.conversationId.trim()
        ))
      ) {
        return json({ error: 'message and optional conversationId are required' }, 400);
      }
      const owner = await authenticatedOwner(request, sessionService, authenticateSupabaseUser);
      const ownerId = owner?.userId ?? 'anon';
      try {
        return json(await backendChatService.chat(ownerId, {
          message: body.message.trim(),
          ...(typeof body.conversationId === 'string'
            ? { conversationId: body.conversationId.trim() }
            : {}),
        }));
      } catch (error) {
        if (error instanceof BackendChatError) {
          return json({ ok: false, error: { code: error.code, message: error.message } }, error.status);
        }
        console.error('Backend chat gateway failed.', error instanceof Error ? error.message : 'Unknown error');
        return json({ ok: false, error: { code: 'CONVERSATION_PERSISTENCE_FAILED', message: 'The chat turn could not be committed.' } }, 500);
      }
    }

    if (request.method === 'POST' && pathname === '/v1/agent/products/search') {
      if (!productRepository || !agentServiceToken) {
        return json({ error: 'agent_catalog_unavailable' }, 503);
      }
      const authorization = request.headers.get('authorization');
      const match = authorization?.match(/^Bearer (.+)$/);
      if (!match || match[1] !== agentServiceToken) {
        return json({ error: 'agent_authentication_required' }, 401);
      }
      const input = parseProductCatalogSearch(await request.json().catch(() => null));
      if (!input) {
        return json({ error: 'invalid_product_search' }, 400);
      }
      try {
        return json({ products: await productRepository.searchCatalog(input) });
      } catch {
        return json({ error: 'product_search_unavailable' }, 500);
      }
    }

    if (
      marketplaceAuthorityService && agentServiceToken && request.method === 'POST'
      && /^\/v1\/agent\/mandates\/[^/]+\/candidates$/.test(pathname)
    ) {
      const authorization = request.headers.get('authorization');
      if (authorization !== `Bearer ${agentServiceToken}`) return json({ error: 'agent_authentication_required' }, 401);
      const mandateId = pathname.split('/')[4];
      if (!mandateId) return json({ error: 'mandate_id_required' }, 400);
      try {
        return json(await marketplaceAuthorityService.candidates(mandateId));
      } catch (error) {
        const detail = (error as Error).message;
        return json({ error: detail.includes('not found') ? 'mandate_not_found' : 'candidate_search_failed', detail }, detail.includes('not found') ? 404 : 400);
      }
    }

    if (
      purchaseService && paymentService && agentServiceToken && request.method === 'POST'
      && /^\/v1\/agent\/products\/[^/]+\/purchase$/.test(pathname)
    ) {
      if (request.headers.get('authorization') !== `Bearer ${agentServiceToken}`) {
        return json({ error: 'agent_authentication_required' }, 401);
      }
      if (!idempotencyKey(request)) return json({ error: 'valid_idempotency_key_required' }, 400);
      const slug = pathname.split('/')[4];
      const rawBody = await request.text();
      let body: { intent?: unknown; agentProof?: PurchaseRequest['agentProof'] };
      try {
        body = JSON.parse(rawBody || '{}') as typeof body;
      } catch {
        return json({ error: 'invalid_json' }, 400);
      }
      if (!slug || body.intent === undefined || !isAgentProof(body.agentProof)) {
        return json({ error: 'slug, intent, and agentProof are required' }, 400);
      }
      try {
        const authorization = await purchaseService.authorizeAutonomousPurchase(
          slug, request.method, pathname, canonicalJson(body.intent), body.agentProof,
        );
        const headers = new Headers(request.headers);
        headers.set('x-agent-execution-proof-id', authorization.executionProofId);
        const paymentRequest = new Request(request.url, { method: request.method, headers, body: rawBody });
        const response = await paymentService.serve(authorization.endpoint, paymentRequest);
        response.headers.set('x-agent-execution-proof-id', authorization.executionProofId);
        return response;
      } catch (error) {
        const detail = (error as Error).message;
        if (/proof|Agent identity|signing key/i.test(detail)) return json({ error: 'authorization_denied', detail }, 401);
        if (/mandate|authorized|expired/i.test(detail)) return json({ error: 'mandate_violation', detail }, 403);
        if (/not found|not enabled/i.test(detail)) return json({ error: 'product_endpoint_not_found', detail }, 404);
        return json({ error: 'purchase_failed', detail }, 500);
      }
    }

    if (request.method === 'GET' && pathname === '/v1/agent/products') {
      if (!productRepository || !agentServiceToken) {
        return json({ error: 'agent_catalog_unavailable' }, 503);
      }
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

    if (
      paymentHistoryRepository && agentServiceToken && request.method === 'GET'
      && /^\/v1\/agent\/proofs\/[^/]+\/payment$/.test(pathname)
    ) {
      if (request.headers.get('authorization') !== `Bearer ${agentServiceToken}`) {
        return json({ error: 'agent_authentication_required' }, 401);
      }
      const proofId = pathname.split('/')[4];
      if (!proofId) return json({ error: 'proof_id_required' }, 400);
      const paymentAttempt = await paymentHistoryRepository.getPaymentAttemptByProof(proofId);
      if (!paymentAttempt) return json({ error: 'payment_attempt_not_found' }, 404);
      return json({ paymentAttempt });
    }

    // Agent-accessible conversation read route. Authenticated by AGENT_SERVICE_TOKEN bearer.
    // The agent reads conversation history to contextualize its reasoning without
    // accessing passkey credentials or owner-private data.
    if (
      conversationRepository &&
      agentServiceToken &&
      /^\/v1\/agent\/conversations\/[^/]+\/messages$/.test(pathname)
    ) {
      const authorization = request.headers.get('authorization');
      const match = authorization?.match(/^Bearer (.+)$/);
      if (!match || match[1] !== agentServiceToken) {
        return json({ error: 'agent_authentication_required' }, 401);
      }
      const conversationId = pathname.split('/')[4];
      if (!conversationId) {
        return json({ error: 'conversation_id_required' }, 400);
      }
      const conversation = await conversationRepository.getConversation(conversationId);
      if (!conversation) {
        return json({ error: 'conversation_not_found' }, 404);
      }
      try {
        const messages = await conversationRepository.listMessages(conversation.id);
        return json({ messages });
      } catch {
        return json({ error: 'conversation_messages_unavailable' }, 500);
      }
    }


    // Conversation routes. Authenticated owners see their conversations;
    // anonymous users share the 'anon' owner so every chat is persisted.
    if (conversationRepository && request.method === 'POST' && pathname === '/v1/conversations') {
      const owner = await authenticatedOwner(request, sessionService, authenticateSupabaseUser);
      const ownerId = owner?.userId ?? 'anon';
      try {
        const conversation = await conversationRepository.createConversation(ownerId);
        return json({ conversation }, 201);
      } catch (error) {
        console.error('Conversation creation failed.', error instanceof Error ? error.message : 'Unknown error');
        return json({ error: 'conversation_creation_failed' }, 500);
      }
    }

    if (conversationRepository && request.method === 'GET' && pathname === '/v1/conversations') {
      const owner = await authenticatedOwner(request, sessionService, authenticateSupabaseUser);
      const ownerId = owner?.userId ?? 'anon';
      try {
        return json({ conversations: await conversationRepository.listConversations(ownerId) });
      } catch {
        return json({ error: 'conversation_list_failed' }, 500);
      }
    }

    if (
      conversationRepository &&
      request.method === 'POST' &&
      /^\/v1\/conversations\/[^/]+\/events$/.test(pathname)
    ) {
      const owner = await authenticatedOwner(request, sessionService, authenticateSupabaseUser);
      const ownerId = owner?.userId ?? 'anon';
      const conversationId = pathname.split('/')[3];
      if (!conversationId) {
        return json({ error: 'conversation_id_required' }, 400);
      }
      const conversation = await conversationRepository.getConversation(conversationId);
      if (!conversation || conversation.ownerId !== ownerId) {
        return json({ error: 'conversation_not_found' }, 404);
      }
      const input = parseConversationEvent(await request.json().catch(() => null));
      if (!input) {
        return json({ error: 'event type, object payload, and createdAt are required' }, 400);
      }
      try {
        const event = await conversationRepository.appendEvent({
          ownerId,
          conversationId: conversation.id,
          ...input,
        });
        return json({ event }, 201);
      } catch (error) {
        console.error('Conversation event persistence failed.', error instanceof Error ? error.message : 'Unknown error');
        return json({ error: 'conversation_event_persistence_failed' }, 500);
      }
    }

    if (
      conversationRepository &&
      /^\/v1\/conversations\/[^/]+\/messages$/.test(pathname) &&
      (request.method === 'GET' || request.method === 'POST')
    ) {
      const owner = await authenticatedOwner(request, sessionService, authenticateSupabaseUser);
      const ownerId = owner?.userId ?? 'anon';
      const conversationId = pathname.split('/')[3];
      if (!conversationId) {
        return json({ error: 'conversation_id_required' }, 400);
      }
      const conversation = await conversationRepository.getConversation(conversationId);
      if (!conversation || conversation.ownerId !== ownerId) {
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
          ownerId,
          conversationId: conversation.id,
          role: body.role,
          content,
          createdAt: body.createdAt,
        });
        return json({ message }, 201);
      } catch (error) {
        console.error('Conversation message persistence failed.', error instanceof Error ? error.message : 'Unknown error');
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
      if (!body.agentIdentityId || !Number.isSafeInteger(body.maxAmountMinor) || (body.maxAmountMinor ?? 0) <= 0 || body.currency !== 'usd'
        || !body.expiresAt || Number.isNaN(Date.parse(body.expiresAt)) || Date.parse(body.expiresAt) <= Date.now()) {
        return json({ error: 'agentIdentityId, maxAmountMinor, currency, and expiresAt are required' }, 400);
      }
      const requestIdempotencyKey = request.headers.has('idempotency-key') ? idempotencyKey(request) : undefined;
      if (request.headers.has('idempotency-key') && !requestIdempotencyKey) {
        return json({ error: 'valid_idempotency_key_required' }, 400);
      }
      if (requestIdempotencyKey && !parseMarketplaceScope(body.scope)) {
        return json({ error: 'invalid_marketplace_scope' }, 400);
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
          maxAmountMinor: body.maxAmountMinor!,
          currency: body.currency,
          expiresAt: body.expiresAt,
          ...(requestIdempotencyKey ? {
            idempotencyKey: requestIdempotencyKey,
            bodySha256: createHash('sha256').update(canonicalJson({
              agentIdentityId: body.agentIdentityId,
              scope: body.scope,
              maxAmountMinor: body.maxAmountMinor,
              currency: body.currency,
            })).digest('hex'),
          } : {}),
        });
        return json({ mandate });
      } catch (err) {
        return json({ error: 'mandate_creation_failed', detail: (err as Error).message }, 400);
      }
    }

    if (mandateRepository && request.method === 'POST' && /^\/v1\/mandates\/[^/]+\/extend$/.test(pathname)) {
      const session = await authenticatedSession(request, sessionService);
      if (!session) return json({ error: 'authentication_required' }, 401);
      const key = idempotencyKey(request);
      const body = await request.json().catch(() => null);
      const mandateId = pathname.split('/')[3];
      if (!key || !isRecord(body) || typeof body.runId !== 'string' || !mandateId) {
        return json({ error: 'runId and a valid Idempotency-Key are required' }, 400);
      }
      const mandate = await mandateRepository.getMandate(mandateId);
      if (!mandate || mandate.ownerId !== session.userId) return json({ error: 'mandate_not_found' }, 404);
      try {
        const extension = await mandateRepository.extendForRun(session.userId, body.runId, key);
        if (extension.mandateId !== mandateId) return json({ error: 'run_mandate_mismatch' }, 409);
        return json({ extension });
      } catch (error) {
        return json({ error: 'mandate_extension_failed', detail: (error as Error).message }, 409);
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

    // Legacy agent runs load their mandate with the server-to-server bearer,
    // not a browser passkey cookie. Keep this narrow route ahead of the
    // owner-scoped browser mandate route below.
    if (
      mandateRepository
      && agentServiceToken
      && request.method === 'GET'
      && /^\/v1\/mandates\/[^/]+\/agent-view$/.test(pathname)
    ) {
      if (request.headers.get('authorization') !== `Bearer ${agentServiceToken}`) {
        return json({ error: 'agent_authentication_required' }, 401);
      }
      const mandateId = pathname.split('/')[3];
      const mandate = mandateId ? await mandateRepository.getMandate(mandateId) : null;
      if (!mandate) return json({ error: 'mandate_not_found' }, 404);
      const query = typeof mandate.scope.query === 'string' && mandate.scope.query.trim()
        ? mandate.scope.query.trim()
        : 'marketplace search';
      return json({
        id: mandate.id,
        version: mandate.version,
        agentId: mandate.agentIdentityId,
        status: mandate.status,
        scope: { category: 'flight', destination: query },
        maxAmountMinor: mandate.maxAmountMinor,
        currency: mandate.currency,
        expiresAt: mandate.expiresAt,
      });
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

    if (
      refundService &&
      request.method === 'POST' &&
      /^\/v1\/payments\/[^/]+\/refund$/.test(pathname)
    ) {
      const session = await authenticatedSession(request, sessionService);
      if (!session) return json({ error: 'authentication_required' }, 401);
      if (!paymentHistoryRepository) return json({ error: 'payment_history_unavailable' }, 503);
      const id = pathname.split('/')[3];
      if (!id) return json({ error: 'payment id is required' }, 400);
      const attempt = await paymentHistoryRepository.getPaymentAttempt(session.userId, id);
      if (!attempt) return json({ error: 'payment_not_found' }, 404);
      if (!attempt.providerPaymentId) return json({ error: 'refund_unavailable', detail: 'No provider payment ID.' }, 400);
      const body = await request.json().catch(() => ({})) as { reason?: string };
      try {
        const refund = await refundService.refund({
          paymentIntentId: attempt.providerPaymentId,
          reason: (body.reason ?? 'requested_by_customer') as 'duplicate' | 'fraudulent' | 'requested_by_customer',
          idempotencyKey: `buyer-refund:${id}`,
        });
        await paymentHistoryRepository.markRefunded(session.userId, id, refund.id);
        return json({ refund }, 200);
      } catch (err) {
        return json({ error: 'refund_failed', detail: (err as Error).message }, 500);
      }
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
