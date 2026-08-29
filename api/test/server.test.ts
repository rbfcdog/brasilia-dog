import assert from 'node:assert/strict';
import test from 'node:test';

import { createNodeServer } from '../src/http/server.js';

test('adapts the Fetch application to a Node HTTP server', async (t) => {
  const server = createNodeServer(async () => Response.json({ status: 'ok' }));
  t.after(() => server.close());

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});
