import type { AppHandler, MppHandler, ProductCatalog, ProductPaymentService } from './types.js';

function json(value: Record<string, unknown>, status = 200): Response {
  return Response.json(value, { status });
}


const OPENAPI_DOCUMENT = Object.freeze({
  openapi: '3.1.0',
  info: {
    title: 'Stripe MPP sandbox API',
    version: '0.1.0',
    description: 'A controlled API endpoint that charges agents for the GET /paid resource using Stripe MPP.',
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
  },
});
export function createApp({
  paidHandler,
  productCatalogService = null,
  paymentService = null,
}: {
  paidHandler: MppHandler;
  productCatalogService?: ProductCatalog | null;
  paymentService?: ProductPaymentService | null;
}): AppHandler {
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

    if (productCatalogService && paymentService) {
      const endpoint = await productCatalogService.resolve(request);
      if (endpoint) {
        return paymentService.serve(endpoint, request);
      }
    }

    return json({ error: 'not_found' }, 404);
  };
}
