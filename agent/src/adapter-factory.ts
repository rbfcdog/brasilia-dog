import { HttpBackendAdapter, type AgentAdapters } from './adapters.js';
import { DemoBackend } from './demo.js';

export function createAgentAdapters({
  mode,
  backendBaseUrl,
  backendToken,
}: {
  mode: 'demo' | 'http';
  backendBaseUrl?: string;
  backendToken?: string;
}): AgentAdapters {
  const backend = backendBaseUrl && backendToken
    ? new HttpBackendAdapter({ baseUrl: backendBaseUrl, token: backendToken })
    : undefined;

  if (mode === 'http') {
    if (!backend) {
      throw new Error('HTTP mode requires backend configuration.');
    }
    return backend;
  }

  const demo = new DemoBackend();
  if (!backend) {
    return demo;
  }

  return {
    mandates: demo,
    catalog: demo,
    signer: demo,
    purchases: demo,
    conversations: backend,
    products: demo,
  };
}
