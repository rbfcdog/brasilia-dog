import { createServer } from 'node:http';
import { HttpBackendAdapter, type AgentAdapters } from './adapters.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { DemoBackend } from './demo.js';
import { AgentService } from './service.js';
import { OpenAIFlightSelector } from './selector.js';

const config = loadConfig();
const adapters: AgentAdapters = config.adapterMode === 'demo'
  ? new DemoBackend()
  : new HttpBackendAdapter({
      baseUrl: requireConfig(config.backendBaseUrl, 'BACKEND_BASE_URL'),
      token: requireConfig(config.backendToken, 'AGENT_BACKEND_TOKEN'),
    });
const selector = new OpenAIFlightSelector({
  apiKey: config.openAIApiKey,
  model: config.openAIModel,
});
const service = new AgentService({ adapters, selector });
const app = createApp({ service, serviceToken: config.serviceToken });
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
