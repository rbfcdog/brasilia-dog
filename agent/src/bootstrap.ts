import { createServer } from 'node:http';
import { createAgentAdapters } from './adapter-factory.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { DemoBackend } from './demo.js';
import { AgentService } from './service.js';
import { OpenAIFlightSelector } from './selector.js';

const config = loadConfig();
const adapters = createAgentAdapters({
  mode: config.adapterMode,
  ...(config.backendBaseUrl ? { backendBaseUrl: config.backendBaseUrl } : {}),
  ...(config.backendToken ? { backendToken: config.backendToken } : {}),
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
