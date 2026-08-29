function json(value, status = 200) {
  return Response.json(value, { status });
}

export function createApp({ paidHandler }) {
  return async function app(request) {
    const { pathname } = new URL(request.url);

    if (request.method === 'GET' && pathname === '/health') {
      return json({ status: 'ok' });
    }

    if (request.method === 'GET' && pathname === '/paid') {
      return paidHandler(request);
    }

    return json({ error: 'not_found' }, 404);
  };
}
