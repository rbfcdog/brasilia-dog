import { createApp } from '../http/app.js';
import { loadConfig } from '../config/config.js';
import { loadEnvironment } from '../config/environment.js';
import { createMppHandler, createPaidHandler } from '../payments/mpp.js';
import { PaymentAttemptRepository } from '../repositories/payment-attempt-repository.js';
import { ProductRepository } from '../repositories/product-repository.js';
import { ProductInfoRepository } from '../repositories/product-info-repository.js';
import { createExpressApp } from '../http/server.js';
import { ProductCatalogService } from '../services/product-catalog-service.js';
import { PaymentService } from '../services/payment-service.js';
import { PasskeyService } from '../services/passkey-service.js';
import { InMemoryPasskeyStore } from '../services/passkey-store.js';
import { RefundService } from '../services/refund-service.js';
import { createSupabaseClient } from '../integrations/supabase.js';

loadEnvironment();

const config = loadConfig();
const supabase = createSupabaseClient(config.supabase);
const productCatalogService = supabase ? new ProductCatalogService(new ProductRepository(supabase)) : null;
const paymentService = supabase ? new PaymentService({
  stripeProfileId: config.stripeProfileId,
  mppHandlerFactory: (options) => createMppHandler(config, options),
  paymentAttemptRepository: new PaymentAttemptRepository(supabase),
}) : null;
const productInfoRepository = supabase ? new ProductInfoRepository(supabase) : null;

const passkeyService = new PasskeyService({
  rpName: config.passkey.rpName,
  rpId: config.passkey.rpId,
  origin: config.passkey.origin,
  store: new InMemoryPasskeyStore(),
});

const refundService = new RefundService(config.stripeSecretKey);

const app = createApp({
  paidHandler: createPaidHandler(config),
  productCatalogService,
  paymentService,
  passkeyService,
  refundService,
  productInfoRepository,
});
const server = createExpressApp(app).listen(config.port, '0.0.0.0');

server.on('error', (error) => {
  console.error('Stripe MPP server failed to start.', error.message);
  process.exitCode = 1;
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Stripe MPP ${config.mode} service listening on http://0.0.0.0:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close());
}
