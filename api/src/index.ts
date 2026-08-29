import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { loadEnvironment } from './environment.js';
import { createMppHandler, createPaidHandler } from './mpp.js';
import { PaymentAttemptRepository } from './repositories/payment-attempt-repository.js';
import { ProductRepository } from './repositories/product-repository.js';
import { createNodeServer } from './server.js';
import { ProductCatalogService } from './services/product-catalog-service.js';
import { PaymentService } from './services/payment-service.js';
import { createSupabaseClient } from './supabase.js';

loadEnvironment();

const config = loadConfig();
const supabase = createSupabaseClient(config.supabase);
const productCatalogService = supabase ? new ProductCatalogService(new ProductRepository(supabase)) : null;
const paymentService = supabase ? new PaymentService({
  stripeProfileId: config.stripeProfileId,
  mppHandlerFactory: (options) => createMppHandler(config, options),
  paymentAttemptRepository: new PaymentAttemptRepository(supabase),
}) : null;
const app = createApp({
  paidHandler: createPaidHandler(config),
  productCatalogService,
  paymentService,
});
const server = createNodeServer(app);

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
