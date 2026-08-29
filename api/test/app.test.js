import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.js';

test('reports service health without touching the payment handler', async () => {
  const app = createApp({
    paidHandler: async () => {
      throw new Error('paid handler must not run for health checks');
    },
  });

  const response = await app(new Request('http://localhost/health'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('passes the controlled paid resource to the MPP handler', async () => {
  const seen = [];
  const app = createApp({
    paidHandler: async (request) => {
      seen.push(request.url);
      return new Response('paid resource', { status: 200 });
    },
  });

  const response = await app(new Request('http://localhost/paid'));

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'paid resource');
  assert.deepEqual(seen, ['http://localhost/paid']);
});

test('rejects routes outside the controlled paid resource', async () => {
  const app = createApp({
    paidHandler: async () => new Response('unexpected'),
  });

  const response = await app(new Request('http://localhost/unknown'));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not_found' });
});
