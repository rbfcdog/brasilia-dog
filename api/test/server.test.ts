import assert from 'node:assert/strict';
import test from 'node:test';

import { createExpressApp } from '../src/http/server.js';

test('adapts the Fetch application to Express and permits cross-origin requests', async (t) => {
  const app = createExpressApp(async () => Response.json({ status: 'ok' }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());

  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}/health`, {
    headers: { Origin: 'https://client.example' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await response.json(), { status: 'ok' });
});
