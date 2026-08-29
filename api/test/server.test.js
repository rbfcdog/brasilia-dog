import assert from 'node:assert/strict';
import test from 'node:test';

import { createNodeServer } from '../src/server.js';

test('adapts the Fetch application to a Node HTTP server', async (t) => {
  const server = createNodeServer(async () => Response.json({ status: 'ok' }));
  t.after(() => server.close());

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});
