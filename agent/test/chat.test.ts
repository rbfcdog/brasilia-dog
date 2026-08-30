import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import test from 'node:test';


import { createApp } from '../src/app.js';
import type { AgentAdapters } from '../src/adapters.js';
import { DemoBackend } from '../src/demo.js';
import { silentStepLogger } from '../src/graph.js';
import { FakeFlightSelector } from '../src/selector.js';
import { AgentService } from '../src/service.js';

test('chat reads persisted context and returns a non-executable purchase mandate proposal', async () => {
  const backend = new DemoBackend();
  const conversationsRead: string[] = [];
  const responderInputs: unknown[] = [];
  const adapters: AgentAdapters = {
    mandates: backend,
    catalog: backend,
    signer: backend,
    purchases: backend,
    conversations: {
      async getConversationMessages(conversationId) {
        conversationsRead.push(conversationId);
        return [{
          id: 'message-1',
          conversationId,
          role: 'user',
          content: 'I need a 34-inch ultrawide monitor.',
          createdAt: '2026-08-30T00:00:00.000Z',
        }];
      },
    },
  };
  const service = new AgentService({
    adapters,
    selector: new FakeFlightSelector(),
    logger: silentStepLogger,
    responder: {
      async respond(input) {
        responderInputs.push(input);
        return {
          kind: 'mandate',
          message: 'I translated your request into a limited purchase mandate.',
          mandate: {
            id: 'draft-monitor-1',
            scope: '34-inch ultrawide monitor',
            maximumAmount: 300,
            currency: 'USD',
            minimumScreenSize: 34,
            validUntil: '2026-09-02T00:00:00.000Z',
            validityHours: 72,
            status: 'pending',
          },
          activity: [],
        };
      },
    },
  });

  const response = await service.chat({
    conversationId: 'conversation-123',
    message: 'Cap the budget at $300.',
  });

  assert.deepEqual(conversationsRead, ['conversation-123']);
  assert.deepEqual(response, {
    kind: 'mandate',
    message: 'I translated your request into a limited purchase mandate.',
    mandate: {
      id: 'draft-monitor-1',
      scope: '34-inch ultrawide monitor',
      maximumAmount: 300,
      currency: 'USD',
      minimumScreenSize: 34,
      validUntil: '2026-09-02T00:00:00.000Z',
      validityHours: 72,
      status: 'pending',
    },
    activity: [],
  });
  assert.deepEqual(responderInputs, [{
    message: 'Cap the budget at $300.',
    conversationContext: 'user: I need a 34-inch ultrawide monitor.',
  }]);
});

test('chat remains available when a demo agent has no conversation context adapter', async () => {
  const backend = new DemoBackend();
  const responderInputs: unknown[] = [];
  const service = new AgentService({
    adapters: backend,
    selector: new FakeFlightSelector(),
    logger: silentStepLogger,
    responder: {
      async respond(input) {
        responderInputs.push(input);
        return {
          kind: 'clarification',
          message: 'What is your budget?',
          activity: [],
        };
      },
    },
  });

  const response = await service.chat({
    conversationId: 'conversation-123',
    message: 'Find appliances.',
  });

  assert.deepEqual(response, {
    kind: 'clarification',
    message: 'What is your budget?',
    activity: [],
  });
  assert.equal(responderInputs.length, 1);
  const [demoResponderInput] = responderInputs as [{ message: string; conversationContext?: unknown }];
  assert.equal(demoResponderInput.message, 'Find appliances.');
  assert.equal(demoResponderInput.conversationContext, undefined);
});

test('the authenticated chat endpoint returns the agent response envelope', async (t) => {
  const backend = new DemoBackend();
  const service = new AgentService({
    adapters: backend,
    selector: new FakeFlightSelector(),
    logger: silentStepLogger,
    responder: {
      async respond() {
        return {
          kind: 'clarification',
          message: 'What is your maximum budget?',
          activity: [],
        };
      },
    },
  });
  const server: Server = createServer(createApp({
    service,
    serviceToken: 'agent-service-token-12345',
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The test server did not bind to a TCP port.');
  }

  const response = await fetch(`http://127.0.0.1:${address.port}/v1/chat`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer agent-service-token-12345',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: 'I need a monitor.' }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: {
      kind: 'clarification',
      message: 'What is your maximum budget?',
      activity: [],
    },
  });
});
