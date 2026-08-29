import type {
  AppHandler,
  MppHandler,
  ProductCatalog,
  ProductPaymentService,
} from '../domain/types.js';

import type { PasskeyService } from '../services/passkey-service.js';
import type { RefundService } from '../services/refund-service.js';
import type { ProductInfoRepository } from '../repositories/product-info-repository.js';

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

const OPENAPI_DOCUMENT = Object.freeze({
  openapi: '3.1.0',
  info: {
    title: 'Stripe MPP sandbox API',
    version: '0.2.0',
    description: 'A controlled API that charges agents for resources using Stripe MPP, with passkey verification and refund support.',
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
        summary: 'Verify a WebAuthn authentication assertion',
        responses: {
          '200': { description: 'Authentication verified' },
          '400': { description: 'Authentication verification failed' },
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
          '200': { description: 'Product details including offerings and endpoints' },
          '404': { description: 'Product not found' },
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
}

export function createApp({
  paidHandler,
  productCatalogService = null,
  paymentService = null,
  passkeyService = null,
  refundService = null,
  productInfoRepository = null,
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
      // /v1/products/:slug/info -> ['', 'v1', 'products', ':slug', 'info']
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
