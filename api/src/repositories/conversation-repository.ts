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

export class ConversationRepository {
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
