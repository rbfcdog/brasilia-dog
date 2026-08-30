import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  Conversation,
  ConversationEvent,
  ConversationEventInput,
  ConversationMessage,
  ConversationMessageInput,
} from '../domain/types.js';

interface ConversationRow {
  id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface ConversationStore {
  createConversation(ownerId: string): Promise<Conversation>;
  listConversations(ownerId: string): Promise<Conversation[]>;
  getConversation(conversationId: string): Promise<Conversation | null>;
  listMessages(conversationId: string): Promise<ConversationMessage[]>;
  appendMessage(input: ConversationMessageInput): Promise<ConversationMessage>;
  appendEvent(input: ConversationEventInput): Promise<ConversationEvent>;
}

interface ConversationEventRow {
  id: string;
  conversation_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: ConversationMessageRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as ConversationMessage['role'],
    content: row.content,
    createdAt: row.created_at,
  };
}

function mapEvent(row: ConversationEventRow): ConversationEvent {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    type: row.type,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

export class ConversationRepository implements ConversationStore {
  constructor(private readonly client: SupabaseClient) {}

  async createConversation(ownerId: string): Promise<Conversation> {
    const { data, error } = await this.client
      .from('conversations')
      .insert({ owner_id: ownerId })
      .select('id, owner_id, created_at, updated_at')
      .single();

    if (error || !data) {
      throw new Error(`Could not create conversation${error?.message ? `: ${error.message}` : '.'}`);
    }

    return mapConversation(data as ConversationRow);
  }

  async listConversations(ownerId: string): Promise<Conversation[]> {
    const { data, error } = await this.client
      .from('conversations')
      .select('id, owner_id, created_at, updated_at')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error('Could not list conversations.');
    }

    return (data as ConversationRow[] ?? []).map(mapConversation);
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const { data, error } = await this.client
      .from('conversations')
      .select('id, owner_id, created_at, updated_at')
      .eq('id', conversationId)
      .maybeSingle();

    if (error) {
      throw new Error('Could not load conversation.');
    }

    return data ? mapConversation(data as ConversationRow) : null;
  }

  async listMessages(conversationId: string): Promise<ConversationMessage[]> {
    const { data, error } = await this.client
      .from('conversation_messages')
      .select('id, conversation_id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      throw new Error('Could not load conversation messages.');
    }

    return (data as ConversationMessageRow[] ?? []).map(mapMessage);
  }

  async appendMessage(input: ConversationMessageInput): Promise<ConversationMessage> {
    const { data, error } = await this.client.rpc('append_conversation_message', {
      p_conversation_id: input.conversationId,
      p_owner_id: input.ownerId,
      p_role: input.role,
      p_content: input.content,
      p_created_at: input.createdAt,
    });

    if (error || !data) {
      throw new Error(`Could not append conversation message${error?.message ? `: ${error.message}` : '.'}`);
    }

    return mapMessage(data as ConversationMessageRow);
  }

  async appendEvent(input: ConversationEventInput): Promise<ConversationEvent> {
    const { data, error } = await this.client.rpc('append_conversation_event', {
      p_conversation_id: input.conversationId,
      p_owner_id: input.ownerId,
      p_type: input.type,
      p_payload: input.payload,
      p_created_at: input.createdAt,
    });

    if (error || !data) {
      throw new Error(`Could not append conversation event${error?.message ? `: ${error.message}` : '.'}`);
    }

    return mapEvent(data as ConversationEventRow);
  }
}

/**
 * Process-local transcript storage for the public sandbox. Live mode continues
 * to use the durable Supabase repository and its server-only access policy.
 */
export class InMemoryConversationRepository implements ConversationStore {
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, ConversationMessage[]>();
  private readonly events = new Map<string, ConversationEvent[]>();

  async createConversation(ownerId: string): Promise<Conversation> {
    const now = new Date().toISOString();
    const conversation = { id: randomUUID(), ownerId, createdAt: now, updatedAt: now };
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    this.events.set(conversation.id, []);
    return { ...conversation };
  }

  async listConversations(ownerId: string): Promise<Conversation[]> {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.ownerId === ownerId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((conversation) => ({ ...conversation }));
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const conversation = this.conversations.get(conversationId);
    return conversation ? { ...conversation } : null;
  }

  async listMessages(conversationId: string): Promise<ConversationMessage[]> {
    return (this.messages.get(conversationId) ?? []).map((message) => ({ ...message }));
  }

  async appendMessage(input: ConversationMessageInput): Promise<ConversationMessage> {
    const conversation = this.ownedConversation(input.conversationId, input.ownerId);
    const { ownerId: _ownerId, ...messageInput } = input;
    const message = { id: randomUUID(), ...messageInput };
    this.messages.get(input.conversationId)!.push(message);
    conversation.updatedAt = this.latest(conversation.updatedAt, input.createdAt);
    return { ...message };
  }

  async appendEvent(input: ConversationEventInput): Promise<ConversationEvent> {
    const conversation = this.ownedConversation(input.conversationId, input.ownerId);
    const event = { id: randomUUID(), ...input };
    this.events.get(input.conversationId)!.push(event);
    conversation.updatedAt = this.latest(conversation.updatedAt, input.createdAt);
    return { ...event, payload: { ...event.payload } };
  }

  private ownedConversation(conversationId: string, ownerId: string): Conversation {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.ownerId !== ownerId) throw new Error('Conversation not found.');
    return conversation;
  }

  private latest(current: string, candidate: string): string {
    return Date.parse(candidate) > Date.parse(current) ? candidate : current;
  }
}
