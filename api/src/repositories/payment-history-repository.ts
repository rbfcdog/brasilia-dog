import type { SupabaseClient } from '@supabase/supabase-js';

import type { AgentActivityRecord, PaymentAttemptRecord, ProductRail } from '../domain/types.js';

interface PaymentAttemptRow {
  id: string;
  product_id: string;
  offering_id: string;
  endpoint_id: string;
  rail: ProductRail;
  provider_payment_id: string | null;
  idempotency_key: string;
  status: PaymentAttemptRecord['status'];
  amount_minor: number;
  currency: string;
  scale: number;
  request_fingerprint: string | null;
  receipt: Record<string, unknown> | null;
  failure_code: string | null;
  agent_execution_proof_id: string | null;
  created_at: string;
}

interface AgentActivityRow {
  id: string;
  agent_identity_id: string;
  agent_signing_key_id: string;
  mandate_id: string;
  mandate_version: number;
  request_method: string;
  request_path: string;
  nonce: string;
  issued_at: string;
  verified_at: string;
  created_at: string;
}

const PAYMENT_SELECT = 'id, product_id, offering_id, endpoint_id, rail, provider_payment_id, idempotency_key, status, amount_minor, currency, scale, request_fingerprint, receipt, failure_code, agent_execution_proof_id, created_at';
const OWNER_SCOPED_PAYMENT_SELECT = `${PAYMENT_SELECT}, agent_execution_proofs!inner(mandates!inner(owner_id))`;

function mapAttempt(row: PaymentAttemptRow): PaymentAttemptRecord {
  return {
    id: row.id,
    productId: row.product_id,
    offeringId: row.offering_id,
    endpointId: row.endpoint_id,
    rail: row.rail,
    providerPaymentId: row.provider_payment_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    scale: row.scale,
    requestFingerprint: row.request_fingerprint,
    receipt: row.receipt,
    failureCode: row.failure_code,
    agentExecutionProofId: row.agent_execution_proof_id,
    createdAt: row.created_at,
  };
}

function mapActivity(row: AgentActivityRow): AgentActivityRecord {
  return {
    id: row.id,
    agentIdentityId: row.agent_identity_id,
    agentSigningKeyId: row.agent_signing_key_id,
    mandateId: row.mandate_id,
    mandateVersion: row.mandate_version,
    requestMethod: row.request_method,
    requestPath: row.request_path,
    nonce: row.nonce,
    issuedAt: row.issued_at,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
  };
}

export class PaymentHistoryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listPaymentAttempts(ownerId: string, limit = 50): Promise<PaymentAttemptRecord[]> {
    const { data, error } = await this.client
      .from('payment_attempts')
      .select(OWNER_SCOPED_PAYMENT_SELECT)
      .eq('agent_execution_proofs.mandates.owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error('Could not list payment attempts.');
    }

    return (data as PaymentAttemptRow[]).map(mapAttempt);
  }

  async getPaymentAttempt(ownerId: string, id: string): Promise<PaymentAttemptRecord | null> {
    const { data, error } = await this.client
      .from('payment_attempts')
      .select(OWNER_SCOPED_PAYMENT_SELECT)
      .eq('id', id)
      .eq('agent_execution_proofs.mandates.owner_id', ownerId)
      .maybeSingle();

    if (error) {
      throw new Error('Could not load payment attempt.');
    }

    return data ? mapAttempt(data as PaymentAttemptRow) : null;
  }

  async markRefunded(ownerId: string, paymentId: string, refundId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('payment_attempts')
      .update({ status: 'refunded', refund_id: refundId })
      .eq('id', paymentId)
      .eq('agent_execution_proofs.mandates.owner_id', ownerId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error('Could not mark payment as refunded.');
    return Boolean(data);
  }
  async getPaymentAttemptByProof(proofId: string): Promise<PaymentAttemptRecord | null> {
    const { data, error } = await this.client
      .from('payment_attempts')
      .select(PAYMENT_SELECT)
      .eq('agent_execution_proof_id', proofId)
      .maybeSingle();
    if (error) throw new Error('Could not load the proof payment attempt.');
    return data ? mapAttempt(data as PaymentAttemptRow) : null;
  }

  async listAgentActivity(agentIdentityId: string, limit = 50): Promise<AgentActivityRecord[]> {
    const { data, error } = await this.client
      .from('agent_execution_proofs')
      .select('id, agent_identity_id, agent_signing_key_id, mandate_id, mandate_version, request_method, request_path, nonce, issued_at, verified_at, created_at')
      .eq('agent_identity_id', agentIdentityId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error('Could not list agent activity.');
    }

    return (data as AgentActivityRow[]).map(mapActivity);
  }
}
