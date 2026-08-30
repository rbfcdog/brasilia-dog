import assert from 'node:assert/strict';
import test from 'node:test';

import type { Conversation, ConversationMessage, ConversationMessageInput, MppHandler } from '../src/domain/types.js';
import type { ConversationRepository } from '../src/repositories/conversation-repository.js';
import type { SessionService } from '../src/services/session-service.js';
import { createApp } from '../src/http/app.js';

const paidHandler: MppHandler = async () => new Response('paid', { status: 200 });

const testSessionService = {
  verifySession: async (token: string) => {
    if (token === 'session-user-1') {
      return { token, userId: 'user-1', credentialId: 'credential-1', issuedAt: 0, expiresAt: Date.now() + 60_000 };
    }
    if (token === 'session-user-2') {
      return { token, userId: 'user-2', credentialId: 'credential-2', issuedAt: 0, expiresAt: Date.now() + 60_000 };
    }
    return null;
  },
} as unknown as SessionService;

function authenticatedRequest(token: string, input: RequestInfo | URL, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${token}`);
  return new Request(input, { ...init, headers });
}

class MockConversationRepository implements Pick<ConversationRepository,
  'createConversation' | 'listConversations' | 'getConversation' | 'listMessages' | 'appendMessage'
> {
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, ConversationMessage[]>();
  private conversationCounter = 0;
  private messageCounter = 0;
  private readonly events = new Map<string, Array<{
    id: string;
    conversationId: string;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>>();
  private eventCounter = 0;

  async createConversation(ownerId: string): Promise<Conversation> {
    const conversation: Conversation = {
      id: `conversation-${++this.conversationCounter}`,
      ownerId,
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    };
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    this.events.set(conversation.id, []);
    return conversation;
  }

  async listConversations(ownerId: string): Promise<Conversation[]> {
    return [...this.conversations.values()].filter((conversation) => conversation.ownerId === ownerId);
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    return this.conversations.get(conversationId) ?? null;
  }

  async listMessages(conversationId: string): Promise<ConversationMessage[]> {
    return this.messages.get(conversationId) ?? [];
  }

  async appendMessage(input: ConversationMessageInput): Promise<ConversationMessage> {
    const message: ConversationMessage = {
      id: `message-${++this.messageCounter}`,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      createdAt: input.createdAt,
    };
    this.messages.get(input.conversationId)?.push(message);
    return message;
  }

  async appendEvent(input: {
    conversationId: string;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }) {
    const event = {
      id: `event-${++this.eventCounter}`,
      conversationId: input.conversationId,
      type: input.type,
      payload: input.payload,
      createdAt: input.createdAt,
    };
    this.events.get(input.conversationId)?.push(event);
    return event;
  }
}

test('persists and returns an owner-scoped conversation transcript', async () => {
  const repository = new MockConversationRepository();
  const app = createApp({
    paidHandler,
    sessionService: testSessionService,
    conversationRepository: repository as unknown as ConversationRepository,
  });

  const created = await app(authenticatedRequest('session-user-1', 'http://localhost/v1/conversations', { method: 'POST' }));
  assert.equal(created.status, 201);
  const { conversation } = await created.json() as { conversation: Conversation };
  assert.equal(conversation.ownerId, 'user-1');

  const message = {
    role: 'user',
    content: 'Buy an ultrawide monitor up to $300',
    createdAt: '2026-08-29T00:01:00.000Z',
  };
  const appended = await app(authenticatedRequest(
    'session-user-1',
    `http://localhost/v1/conversations/${conversation.id}/messages`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message) },
  ));
  assert.equal(appended.status, 201);
  const persisted = (await appended.json() as { message: ConversationMessage }).message;
  assert.deepEqual(persisted, { ...message, id: 'message-1', conversationId: conversation.id });

  const transcript = await app(authenticatedRequest(
    'session-user-1',
    `http://localhost/v1/conversations/${conversation.id}/messages`,
  ));
  assert.equal(transcript.status, 200);
  assert.deepEqual(await transcript.json(), { messages: [persisted] });

  const listed = await app(authenticatedRequest('session-user-1', 'http://localhost/v1/conversations'));
  assert.equal(listed.status, 200);
  assert.deepEqual((await listed.json()).conversations, [conversation]);
});

test('persists immutable owner-scoped agent interaction evidence', async () => {
  const repository = new MockConversationRepository();
  const conversation = await repository.createConversation('user-1');
  const app = createApp({
    paidHandler,
    sessionService: testSessionService,
    conversationRepository: repository as unknown as ConversationRepository,
  });

  const response = await app(authenticatedRequest(
    'session-user-1',
    `http://localhost/v1/conversations/${conversation.id}/events`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'catalog_search',
        payload: {
          query: 'ultrawide monitor',
          resultSlugs: ['aster-34-uwqhd'],
        },
        createdAt: '2026-08-29T00:01:00.000Z',
      }),
    },
  ));

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    event: {
      id: 'event-1',
      conversationId: conversation.id,
      type: 'catalog_search',
      payload: {
        query: 'ultrawide monitor',
        resultSlugs: ['aster-34-uwqhd'],
      },
      createdAt: '2026-08-29T00:01:00.000Z',
    },
  });
});

test('does not expose a conversation transcript to another owner', async () => {
  const repository = new MockConversationRepository();
  const conversation = await repository.createConversation('user-1');
  const app = createApp({
    paidHandler,
    sessionService: testSessionService,
    conversationRepository: repository as unknown as ConversationRepository,
  });

  const response = await app(authenticatedRequest(
    'session-user-2',
    `http://localhost/v1/conversations/${conversation.id}/messages`,
  ));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'conversation_not_found' });
});

test('creates an anonymous conversation without authentication', async () => {
  const app = createApp({ paidHandler, conversationRepository: new MockConversationRepository() as unknown as ConversationRepository });

  const response = await app(new Request('http://localhost/v1/conversations', { method: 'POST' }));

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.ok(body.conversation.id);
});
