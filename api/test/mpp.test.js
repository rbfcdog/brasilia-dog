import assert from 'node:assert/strict';
import test from 'node:test';

import { createPaidHandler } from '../src/mpp.js';

const sandboxConfig = {
  mode: 'sandbox',
  mppSecretKey: '12345678901234567890123456789012',
  stripeSecretKey: 'sk_test_example',
  stripeProfileId: 'profile_test_example',
};

test('issues a Stripe MPP payment challenge before serving the controlled resource', async () => {
  const paidHandler = createPaidHandler(sandboxConfig);

  const response = await paidHandler(new Request('http://localhost/paid'));

  assert.equal(response.status, 402);
  assert.match(response.headers.get('www-authenticate') ?? '', /^Payment /);
});
