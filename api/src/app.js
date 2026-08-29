function json(value, status = 200) {
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
export function createApp({ paidHandler }) {
  return async function app(request) {
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

    return json({ error: 'not_found' }, 404);
  };
}
