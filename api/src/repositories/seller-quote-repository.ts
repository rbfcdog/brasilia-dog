import { createHash } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { SellerQuoteRequestRecord } from '../domain/types.js';

interface SellerQuoteRow {
  id: string;
  merchant_id: string;
  owner_id: string;
  agent_identity_id: string;
  mandate_id: string;
  credential_commitment: string;
  agent_verification_hash: string;
  price_limit_minor: number;
  currency: string;
  requirements: string[];
  expires_at: string;
  created_at: string;
}

function hashMerchantApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

function mapQuote(row: SellerQuoteRow): SellerQuoteRequestRecord {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    ownerId: row.owner_id,
    agentIdentityId: row.agent_identity_id,
    mandateId: row.mandate_id,
    credentialCommitment: row.credential_commitment,
    agentVerificationHash: row.agent_verification_hash,
    priceLimitMinor: Number(row.price_limit_minor),
    currency: row.currency,
    requirements: row.requirements,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export class SellerQuoteRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: Omit<SellerQuoteRequestRecord, 'id' | 'createdAt'>): Promise<SellerQuoteRequestRecord> {
    const { data, error } = await this.client.rpc('record_seller_quote_request', {
      p_merchant_id: input.merchantId,
      p_owner_id: input.ownerId,
      p_agent_identity_id: input.agentIdentityId,
      p_mandate_id: input.mandateId,
      p_credential_commitment: input.credentialCommitment,
      p_agent_verification_hash: input.agentVerificationHash,
      p_price_limit_minor: input.priceLimitMinor,
      p_currency: input.currency,
      p_requirements: input.requirements,
      p_expires_at: input.expiresAt,
    });

    if (error || !data) {
      throw new Error('Could not create seller quote request.');
    }

    return mapQuote(data as SellerQuoteRow);
  }

  async getForSeller(merchantApiKey: string, quoteRequestId: string): Promise<SellerQuoteRequestRecord | null> {
    const apiKeyHash = hashMerchantApiKey(merchantApiKey);
    const { data: merchant, error: merchantError } = await this.client
      .from('merchant_integrations')
      .select('id')
      .eq('api_key_hash', apiKeyHash)
      .eq('status', 'active')
      .maybeSingle();

    if (merchantError || !merchant) return null;

    const { data, error } = await this.client
      .from('seller_quote_requests')
      .select('id, merchant_id, owner_id, agent_identity_id, mandate_id, credential_commitment, agent_verification_hash, price_limit_minor, currency, requirements, expires_at, created_at')
      .eq('id', quoteRequestId)
      .eq('merchant_id', merchant.id)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) {
      throw new Error('Could not load seller quote request.');
    }

    return data ? mapQuote(data as SellerQuoteRow) : null;
  }
}
