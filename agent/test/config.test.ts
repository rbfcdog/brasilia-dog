import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

const baseEnvironment = {
  PORT: '3001',
  AGENT_SERVICE_TOKEN: 'agent-service-token-12345',
  OPENAI_API_KEY: 'test-key-not-used',
  OPENAI_MODEL: 'test-model-required-not-hardcoded',
};

test('demo configuration still requires explicit OpenAI model and key', () => {
  const config = loadConfig({ ...baseEnvironment, ADAPTER_MODE: 'demo' });
  assert.equal(config.adapterMode, 'demo');
  assert.equal(config.openAIModel, 'test-model-required-not-hardcoded');
  assert.throws(
    () => loadConfig({ ...baseEnvironment, OPENAI_MODEL: '', ADAPTER_MODE: 'demo' }),
    /OPENAI_MODEL/,
  );
});

test('HTTP mode requires its backend URL and service token', () => {
  assert.throws(
    () => loadConfig({ ...baseEnvironment, ADAPTER_MODE: 'http' }),
    /BACKEND_BASE_URL and AGENT_BACKEND_TOKEN/,
  );
  const config = loadConfig({
    ...baseEnvironment,
    ADAPTER_MODE: 'http',
    BACKEND_BASE_URL: 'https://backend.example.test',
    AGENT_BACKEND_TOKEN: 'backend-service-token-12345',
  });
  assert.equal(config.backendBaseUrl, 'https://backend.example.test');
});
