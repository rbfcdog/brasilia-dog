import assert from 'node:assert/strict';
import test from 'node:test';

import { createPaidHandler } from '../src/payments/mpp.js';
import type { AppConfig } from '../src/domain/types.js';

const sandboxConfig: AppConfig = {
  port: 3000,
  mode: 'sandbox',
  mppSecretKey: '12345678901234567890123456789012',
  stripeSecretKey: 'sk_test_example',
  stripeProfileId: 'profile_test_example',
  supabase: null,
  passkey: { rpName: 'Test', rpId: 'localhost', origin: 'http://localhost:3000' },
  sessionSecret: 'a'.repeat(64),
  agentServiceToken: null,
  agentServiceOutboundToken: null,
  agentServiceUrl: null,
};

test('issues a Stripe MPP payment challenge before serving the controlled resource', async () => {
  const paidHandler = createPaidHandler(sandboxConfig);

  const response = await paidHandler(new Request('http://localhost/paid'));

  assert.equal(response.status, 402);
  assert.match(response.headers.get('www-authenticate') ?? '', /^Payment /);
  assert.match(
    response.headers.get('www-authenticate') ?? '',
    /header="Payment-Authorization"/,
  );
});
