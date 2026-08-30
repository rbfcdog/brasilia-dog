import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import type { AgentAdapters } from '../src/adapters.js';
import { DEMO_MANDATE_ID, DemoBackend } from '../src/demo.js';
import { silentStepLogger } from '../src/graph.js';
import { FakeFlightSelector } from '../src/selector.js';
import { AgentService } from '../src/service.js';
import { waitForStatus } from './helpers.js';

import { HttpBackendAdapter } from '../src/adapters.js';

const backendToken = 'backend-conversation-token-12345';

test('HTTP adapter reads an agent-authorized conversation transcript from the backend', async (t) => {
  const messages = [
    {
      id: 'message-1',
      conversationId: 'conversation-123',
      role: 'user',
      content: 'Find the cheapest available flight to Córdoba.',
      createdAt: '2026-08-30T00:00:00.000Z',
    },
    {
      id: 'message-2',
      conversationId: 'conversation-123',
      role: 'assistant',
      content: 'I will compare authorized offers only.',
      createdAt: '2026-08-30T00:01:00.000Z',
    },
  ];
  const server = createServer((request, response) => {
    assert.equal(request.method, 'GET');
    assert.equal(request.url, '/v1/agent/conversations/conversation-123/messages');
    assert.equal(request.headers.authorization, `Bearer ${backendToken}`);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ messages }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The test server did not bind to a TCP port.');
  }

  const adapter = new HttpBackendAdapter({
    baseUrl: `http://127.0.0.1:${address.port}`,
    token: backendToken,
  });

  assert.deepEqual(
    await adapter.getConversationMessages('conversation-123'),
    messages,
  );
});

test('a run uses its backend conversation context only as untrusted selector input', async () => {
  const backend = new DemoBackend();
  const selector = new FakeFlightSelector();
  const requestedConversationIds: string[] = [];
  const adapters: AgentAdapters = {
    mandates: backend,
    catalog: backend,
    signer: backend,
    purchases: backend,
    conversations: {
      async getConversationMessages(conversationId) {
        requestedConversationIds.push(conversationId);
        return [
          {
            id: 'message-1',
            conversationId,
            role: 'user',
            content: 'Find the cheapest authorized flight to Córdoba.',
            createdAt: '2026-08-30T00:00:00.000Z',
          },
        ];
      },
    },
  };
  const service = new AgentService({
    adapters,
    selector,
    logger: silentStepLogger,
  });

  const request = {
    goal: 'Buy a flight to Córdoba below USD 150',
    mandateId: DEMO_MANDATE_ID,
    conversationId: 'conversation-123',
  };
  const started = service.start(randomUUID(), request);
  await waitForStatus(service, started.runId, 'completed');

  assert.deepEqual(requestedConversationIds, ['conversation-123']);
  assert.equal(
    selector.inputs[0]?.conversationContext,
    'user: Find the cheapest authorized flight to Córdoba.',
  );
});
