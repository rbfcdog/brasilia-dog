import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createAgentAdapters } from './adapter-factory.js';
import { OpenAIShoppingResponder } from './chat.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { AgentService } from './service.js';
import { OpenAIFlightSelector } from './selector.js';
import { loadEnvironment } from './environment.js';
import { PersistentAgentIdentity } from './agent-identity.js';
import { DurableRunRepository } from './durable-run-repository.js';
import { MarketplaceAuthorityClient } from './marketplace-authority-client.js';
import { OpenAIMarketplaceSelector } from './marketplace-selector.js';
import { MarketplaceRunService } from './marketplace-service.js';

loadEnvironment();
const config = loadConfig();
if (config.adapterMode !== 'http') {
  throw new Error('The runtime agent requires ADAPTER_MODE=http. DemoBackend is test-only.');
}
const adapters = createAgentAdapters({
  mode: config.adapterMode,
  ...(config.backendBaseUrl ? { backendBaseUrl: config.backendBaseUrl } : {}),
  ...(config.backendToken ? { backendToken: config.backendToken } : {}),
});
const selector = new OpenAIFlightSelector({
  apiKey: config.openAIApiKey,
  model: config.openAIModel,
});
const responder = new OpenAIShoppingResponder({
  apiKey: config.openAIApiKey,
  model: config.openAIModel,
});
const service = new AgentService({ adapters, selector, responder });
const supabase = createClient(
  requireConfig(config.supabaseUrl, 'SUPABASE_URL'),
  requireConfig(config.supabaseKey, 'SUPABASE_SECRET_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const identity = new PersistentAgentIdentity({
  ...(config.signingPrivateJwk ? { privateJwk: config.signingPrivateJwk } : {}),
  keyPath: config.signingKeyPath,
});
const marketplaceService = new MarketplaceRunService({
  repository: new DurableRunRepository(supabase),
  authority: new MarketplaceAuthorityClient({
    baseUrl: requireConfig(config.backendBaseUrl, 'BACKEND_BASE_URL'),
    token: requireConfig(config.backendToken, 'AGENT_BACKEND_TOKEN'),
    stripeSecretKey: requireConfig(config.stripeSecretKey, 'STRIPE_SECRET_KEY'),
    identity,
  }),
  selector: new OpenAIMarketplaceSelector({ apiKey: config.openAIApiKey, model: config.openAIModel }),
  identity,
  legacy: service,
  workerId: `agent-${randomUUID()}`,
});
marketplaceService.startWorker();
const app = createApp({ service: marketplaceService, serviceToken: config.serviceToken });
const server = createServer(app);

server.listen(config.port, '0.0.0.0', () => {
  console.info(JSON.stringify({ event: 'agent_service_started', port: config.port }));
});

function requireConfig(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    marketplaceService.stopWorker();
    server.close();
  });
}
