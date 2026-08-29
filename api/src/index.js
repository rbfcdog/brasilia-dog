import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { loadEnvironment } from './environment.js';
import { createPaidHandler } from './mpp.js';
import { createNodeServer } from './server.js';

loadEnvironment();

const config = loadConfig();
const app = createApp({ paidHandler: createPaidHandler(config) });
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
