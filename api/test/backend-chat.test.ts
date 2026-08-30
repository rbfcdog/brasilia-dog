import assert from 'node:assert/strict';
import test from 'node:test';

import type { ConversationRepository } from '../src/repositories/conversation-repository.js';
import type { AgentRefundService } from '../src/services/agent-refund-service.js';
import { BackendChatService } from '../src/services/backend-chat-service.js';

function fixture() {
  const sequence: string[] = [];
  const messages: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const repository = {
    async createConversation(ownerId: string) {
      sequence.push('conversation');
      return { id: 'conversation-1', ownerId, createdAt: '', updatedAt: '' };
    },
    async getConversation() { return null; },
    async appendMessage(input: Record<string, unknown>) {
      sequence.push(`message:${String(input.role)}`);
      messages.push(input);
      return { id: `message-${messages.length}`, ...input };
    },
    async appendEvent(input: Record<string, unknown>) {
      sequence.push(`event:${String(input.type)}`);
      events.push(input);
      return { id: `event-${events.length}`, ...input };
    },
  } as unknown as ConversationRepository;
  return { sequence, messages, events, repository };
}

test('backend chat persists the user before agent invocation and commits the reply before returning', async () => {
  const { sequence, messages, events, repository } = fixture();
  const request = async (_input: RequestInfo | URL, init?: RequestInit) => {
    sequence.push('agent');
    assert.equal(messages[0]?.role, 'user');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      message: 'Find a monitor.',
      conversationId: 'conversation-1',
    });
    return new Response(JSON.stringify({
      ok: true,
      data: { kind: 'clarification', message: 'What is your maximum budget?', activity: [] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const service = new BackendChatService(repository, 'https://agent.example.test', 'agent-token', request as typeof fetch);

  const result = await service.chat('user-1', { message: 'Find a monitor.' });

  assert.deepEqual(sequence, ['conversation', 'message:user', 'agent', 'message:assistant', 'event:agent_response']);
  assert.equal(messages[1]?.content, 'What is your maximum budget?');
  assert.equal(events[0]?.type, 'agent_response');
  assert.equal(result.data.conversationId, 'conversation-1');
});

test('backend chat persists mandate evidence only after the assistant message', async () => {
  const { sequence, events, repository } = fixture();
  const request = async () => {
    sequence.push('agent');
    return new Response(JSON.stringify({
      ok: true,
      data: {
        kind: 'mandate',
        message: 'Review this mandate.',
        mandate: { id: 'mandate-1', scope: 'monitor', maximumAmount: 300 },
        activity: [],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const service = new BackendChatService(repository, 'https://agent.example.test', 'agent-token', request as typeof fetch);

  await service.chat('user-1', { message: 'Buy a monitor.' });

  assert.deepEqual(sequence, [
    'conversation',
    'message:user',
    'agent',
    'message:assistant',
    'event:agent_response',
    'event:mandate_proposed',
  ]);
  assert.equal(events[1]?.type, 'mandate_proposed');
});

test('backend chat executes an agent refund through the authenticated backend and returns a safe receipt', async () => {
  const { sequence, messages, events, repository } = fixture();
  const request = async () => {
    sequence.push('agent');
    return new Response(JSON.stringify({
      ok: true,
      data: {
        kind: 'refund',
        message: 'Refund intent detected.',
        refund: { selection: 'latest', paymentAttemptId: null, reason: 'requested_by_customer' },
        activity: [],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const refunds = {
    async refund(ownerId: string, intent: unknown) {
      sequence.push('refund');
      assert.equal(ownerId, 'user-1');
      assert.deepEqual(intent, { selection: 'latest', paymentAttemptId: null, reason: 'requested_by_customer' });
      return {
        id: 're_safe_reference',
        paymentAttemptId: 'payment-1',
        paymentIntentId: 'pi_must_not_reach_browser',
        amount: 9_500,
        currency: 'usd',
        scale: 2,
        status: 'succeeded',
        reason: 'requested_by_customer',
      };
    },
  } as unknown as AgentRefundService;
  const service = new BackendChatService(
    repository,
    'https://agent.example.test',
    'agent-token',
    request as typeof fetch,
    refunds,
  );

  const result = await service.chat('user-1', { message: 'I want the refund.' });

  assert.deepEqual(sequence, [
    'conversation',
    'message:user',
    'agent',
    'refund',
    'message:assistant',
    'event:agent_response',
    'event:refund_processed',
  ]);
  assert.match(String(messages[1]?.content), /refund was completed with Stripe for \$95\.00/i);
  assert.equal(events[1]?.type, 'refund_processed');
  assert.equal('paymentIntentId' in (result.data.refund as Record<string, unknown>), false);
  assert.deepEqual(result.data.refund, {
    id: 're_safe_reference',
    paymentAttemptId: 'payment-1',
    amount: 9_500,
    currency: 'usd',
    scale: 2,
    status: 'succeeded',
    reason: 'requested_by_customer',
  });
});

test('backend chat requires authentication before executing a detected refund', async () => {
  const { repository } = fixture();
  let refundCalls = 0;
  const request = async () => new Response(JSON.stringify({
    ok: true,
    data: {
      kind: 'refund',
      message: 'Refund intent detected.',
      refund: { selection: 'latest', paymentAttemptId: null, reason: 'requested_by_customer' },
      activity: [],
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const refunds = {
    async refund() { refundCalls += 1; throw new Error('must not be called'); },
  } as unknown as AgentRefundService;
  const service = new BackendChatService(
    repository,
    'https://agent.example.test',
    'agent-token',
    request as typeof fetch,
    refunds,
  );

  await assert.rejects(
    service.chat('anon', { message: 'Refund my purchase.' }),
    (error: unknown) => error instanceof Error
      && 'code' in error
      && error.code === 'REFUND_AUTHENTICATION_REQUIRED'
      && 'status' in error
      && error.status === 401,
  );
  assert.equal(refundCalls, 0);
});

test('backend chat exposes an agent catalog outage as a retryable 503', async () => {
  const { repository } = fixture();
  const request = async () => new Response(JSON.stringify({
    ok: false,
    error: {
      code: 'PRODUCT_CATALOG_UNAVAILABLE',
      message: 'The backend product catalog is temporarily unavailable.',
    },
  }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  const service = new BackendChatService(repository, 'https://agent.example.test', 'agent-token', request as typeof fetch);

  await assert.rejects(
    service.chat('user-1', { message: 'Show current products.' }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === 'PRODUCT_CATALOG_UNAVAILABLE'
      && "status" in error && error.status === 503,
  );
});

test('backend chat preserves a safe agent service error for the caller', async () => {
  const { repository } = fixture();
  const request = async () => new Response(JSON.stringify({
    ok: false,
    error: {
      code: 'CONVERSATION_CONTEXT_UNAVAILABLE',
      message: 'Conversation context requires a backend-connected agent adapter.',
    },
  }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  const service = new BackendChatService(repository, 'https://agent.example.test', 'agent-token', request as typeof fetch);

  await assert.rejects(
    service.chat('user-1', { message: 'Show current products.' }),
    (error: unknown) => error instanceof Error
      && 'code' in error
      && error.code === 'CONVERSATION_CONTEXT_UNAVAILABLE'
      && error.message === 'Conversation context requires a backend-connected agent adapter.'
      && 'status' in error
      && error.status === 503,
  );
});
