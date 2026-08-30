import { createServer } from 'node:http';
import { createAgentAdapters } from './adapter-factory.js';
import { OpenAIShoppingResponder } from './chat.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { AgentService } from './service.js';
import { OpenAIFlightSelector } from './selector.js';
import { loadEnvironment } from './environment.js';

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
const app = createApp({ service, serviceToken: config.serviceToken });
const server = createServer(app);

server.listen(config.port, '0.0.0.0', () => {
  console.info(JSON.stringify({ event: 'agent_service_started', port: config.port }));
});


for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close();
  });
}
