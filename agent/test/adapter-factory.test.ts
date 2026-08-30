import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpBackendAdapter } from '../src/adapters.js';
import { createAgentAdapters } from '../src/adapter-factory.js';
import { DemoBackend } from '../src/demo.js';

test('demo mode uses the backend only for persisted conversation context', () => {
  const adapters = createAgentAdapters({
    mode: 'demo',
    backendBaseUrl: 'https://api.example.test',
    backendToken: 'backend-context-token-12345',
  });

  assert.ok(adapters.mandates instanceof DemoBackend);
  assert.ok(adapters.conversations instanceof HttpBackendAdapter);
});

test('HTTP mode uses the authoritative backend for every agent adapter', () => {
  const adapters = createAgentAdapters({
    mode: 'http',
    backendBaseUrl: 'https://api.example.test',
    backendToken: 'backend-context-token-12345',
  });

  assert.ok(adapters.mandates instanceof HttpBackendAdapter);
  assert.equal(adapters.conversations, adapters.mandates);
});
