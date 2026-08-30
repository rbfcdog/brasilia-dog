import type { SupabaseClient, User } from '@supabase/supabase-js';

type MetadataValue = string | number | boolean;

export interface MerchantProductInput {
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  amountMinor?: unknown;
  currency?: unknown;
  metadata?: unknown;
}

export interface MerchantRefundCaseInput {
  paymentAttemptId?: unknown;
  amountMinor?: unknown;
  reason?: unknown;
  note?: unknown;
}

export class MerchantCommandError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = 'merchant_command_invalid') {
    super(message);
    this.name = 'MerchantCommandError';
  }
}

function isMetadata(value: unknown): value is Record<string, MetadataValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.length <= 50 && entries.every(([key, item]) =>
    /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(key) &&
    (typeof item === 'string' || typeof item === 'number' && Number.isFinite(item) || typeof item === 'boolean') &&
    (typeof item !== 'string' || item.length <= 500)
  );
}

export class MerchantService {
  constructor(private readonly client: SupabaseClient, private readonly stripeProfileId: string) {}

  async authenticate(accessToken: string): Promise<User> {
    const { data, error } = await this.client.auth.getUser(accessToken);
    if (error || !data.user) throw new MerchantCommandError('Merchant authentication is required.', 401, 'merchant_authentication_required');

    const { data: profile, error: profileError } = await this.client
      .from('merchant_profiles')
      .select('status')
      .eq('user_id', data.user.id)
      .maybeSingle();
    if (profileError || !profile || profile.status !== 'active') {
      throw new MerchantCommandError('An active Merchant profile is required.', 403, 'merchant_profile_inactive');
    }
    return data.user;
  }

  async createProduct(ownerId: string, input: MerchantProductInput): Promise<{ id: string; status: 'draft' }> {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    if (name.length < 2 || name.length > 160) throw new MerchantCommandError('Product name must contain 2 to 160 characters.');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new MerchantCommandError('Product slug is invalid.');
    if (description.length < 10 || description.length > 2_000) throw new MerchantCommandError('Product description must contain 10 to 2000 characters.');
    if (!Number.isSafeInteger(input.amountMinor) || (input.amountMinor as number) <= 0) throw new MerchantCommandError('A positive fixed price in minor units is required.');
    if (input.currency !== 'usd') throw new MerchantCommandError('Only fixed USD pricing is supported.');
    if (!isMetadata(input.metadata)) throw new MerchantCommandError('Structured metadata must contain 1 to 50 primitive key-value pairs.');

    const { data, error } = await this.client.rpc('create_merchant_product', {
      p_owner_id: ownerId,
      p_name: name,
      p_slug: slug,
      p_description: description,
      p_amount_minor: input.amountMinor,
      p_currency: 'usd',
      p_metadata: input.metadata,
      p_network_id: this.stripeProfileId,
    });
    if (error) {
      const duplicate = error.code === '23505';
      throw new MerchantCommandError(duplicate ? 'That product slug is already in use.' : 'Could not create the product draft.', duplicate ? 409 : 400, duplicate ? 'product_slug_conflict' : 'product_create_failed');
    }
    return { id: String(data), status: 'draft' };
  }

  async publishProduct(ownerId: string, productId: string): Promise<{ id: string; status: 'published' }> {
    if (!/^[0-9a-f-]{36}$/i.test(productId)) throw new MerchantCommandError('Product ID is invalid.');
    const { data, error } = await this.client.rpc('publish_merchant_product', { p_owner_id: ownerId, p_product_id: productId });
    if (error || data !== true) throw new MerchantCommandError('Owned publishable draft was not found.', 404, 'product_not_found');
    return { id: productId, status: 'published' };
  }

  async createRefundCase(ownerId: string, input: MerchantRefundCaseInput): Promise<{ id: string; status: 'requested' }> {
    const paymentAttemptId = typeof input.paymentAttemptId === 'string' ? input.paymentAttemptId : '';
    const reason = typeof input.reason === 'string' ? input.reason : '';
    const note = typeof input.note === 'string' ? input.note.trim() : null;
    const amountMinor = input.amountMinor === undefined ? null : input.amountMinor;
    if (!/^[0-9a-f-]{36}$/i.test(paymentAttemptId)) throw new MerchantCommandError('Payment attempt ID is invalid.');
    if (!['duplicate', 'fraudulent', 'requested_by_customer'].includes(reason)) throw new MerchantCommandError('Refund reason is invalid.');
    if (amountMinor !== null && (!Number.isSafeInteger(amountMinor) || (amountMinor as number) <= 0)) throw new MerchantCommandError('Requested amount must be a positive integer.');
    if (note && note.length > 500) throw new MerchantCommandError('Refund note must not exceed 500 characters.');

    const { data, error } = await this.client.rpc('create_merchant_refund_case', {
      p_owner_id: ownerId,
      p_payment_attempt_id: paymentAttemptId,
      p_amount_minor: amountMinor,
      p_reason: reason,
      p_note: note,
    });
    if (error) {
      const duplicate = error.code === '23505';
      const notFound = error.message.includes('not found');
      throw new MerchantCommandError(duplicate ? 'An open refund case already exists for this receipt.' : notFound ? 'Owned settled payment attempt was not found.' : 'Could not create the refund case.', duplicate ? 409 : notFound ? 404 : 400, duplicate ? 'refund_case_conflict' : notFound ? 'payment_attempt_not_found' : 'refund_case_create_failed');
    }
    return { id: String(data), status: 'requested' };
  }
}
