import { z } from 'zod';

const constraintSchema = z.strictObject({
  field: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  operator: z.enum(['eq', 'gte', 'lte']),
  value: z.union([z.string(), z.number().finite(), z.boolean()]),
});

export const marketplaceScopeSchema = z.strictObject({
  query: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(80),
  constraints: z.array(constraintSchema).max(8),
  searchWindowSeconds: z.literal(60),
});

export const marketplaceMandateSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  agentIdentityId: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.enum(['active', 'revoked', 'expired']),
  scope: marketplaceScopeSchema,
  maxAmountMinor: z.number().int().positive(),
  currency: z.literal('usd'),
  expiresAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
});

export const marketplaceProductSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  status: z.literal('published'),
  metadata: z.record(z.string(), z.unknown()),
  merchant: z.strictObject({
    id: z.string().uuid(),
    businessName: z.string(),
    status: z.literal('active'),
  }),
  offering: z.strictObject({
    id: z.string().uuid(),
    rail: z.literal('stripe_mpp'),
    amountMinor: z.number().int().positive(),
    currency: z.literal('usd'),
    scale: z.number().int().nonnegative(),
    networkId: z.string().nullable(),
    active: z.literal(true),
  }),
  endpoint: z.strictObject({
    id: z.string().uuid(),
    method: z.enum(['GET', 'POST']),
    path: z.string().startsWith('/'),
    enabled: z.literal(true),
  }),
});

export const candidateResponseSchema = z.strictObject({
  mandate: marketplaceMandateSchema,
  candidates: z.array(marketplaceProductSchema).max(25),
});

export type MarketplaceMandate = z.infer<typeof marketplaceMandateSchema>;
export type MarketplaceProduct = z.infer<typeof marketplaceProductSchema>;

export type MarketplaceRunStatus = 'queued' | 'running' | 'monitoring' | 'waiting_for_extension' | 'completed' | 'rejected' | 'failed';

export interface MarketplaceRunState {
  agentIdentityId: string;
  agentSigningKeyId: string;
  mandate?: MarketplaceMandate;
  candidates: MarketplaceProduct[];
  selectedProduct?: MarketplaceProduct;
  selectionRationale?: string;
  authorityChecks: Array<{ name: string; passed: boolean; checkedAt: string }>;
  extensionRequest?: { mandateId: string; expiredAt: string; requestedAt: string };
  extensionId?: string;
  proofId?: string;
  paymentAttempt?: Record<string, unknown>;
  receipt?: Record<string, unknown>;
}

export interface PublicMarketplaceRun {
  runId: string;
  ownerId: string;
  status: MarketplaceRunStatus;
  goal: string;
  mandateId: string;
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
  nextPollAt?: string;
  events: Array<{ sequence: number; type: string; occurredAt: string; data: Record<string, unknown> }>;
  mandate?: MarketplaceMandate;
  candidates: MarketplaceProduct[];
  selectedProduct?: MarketplaceProduct;
  authorityChecks: MarketplaceRunState['authorityChecks'];
  extensionRequest?: MarketplaceRunState['extensionRequest'];
  extensionId?: string;
  proofId?: string;
  paymentAttempt?: Record<string, unknown>;
  receipt?: Record<string, unknown>;
  result?: Record<string, unknown>;
}
