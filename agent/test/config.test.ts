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

test('agent configuration excludes direct database and payment credentials', () => {
  const config = loadConfig({
    ...baseEnvironment,
    ADAPTER_MODE: 'http',
    BACKEND_BASE_URL: 'https://backend.example.test',
    AGENT_BACKEND_TOKEN: 'backend-service-token-12345',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SECRET_KEY: 'service-role-secret',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role-secret',
    STRIPE_SECRET_KEY: 'sk_test_secret',
  });

  assert.equal('supabaseUrl' in config, false);
  assert.equal('supabaseKey' in config, false);
  assert.equal('stripeSecretKey' in config, false);
});
