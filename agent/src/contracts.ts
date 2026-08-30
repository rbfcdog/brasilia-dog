import { z } from 'zod';

const id = z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/.test(value));
const currency = z.string().regex(/^[a-z]{3}$/);
const minorUnits = z.number().int().nonnegative().safe();

export const mandateViewSchema = z.strictObject({
  id,
  version: z.number().int().positive().safe(),
  agentId: id,
  status: z.enum(['active', 'revoked', 'expired']),
  scope: z.strictObject({
    category: z.literal('flight'),
    destination: z.string().trim().min(1).max(200),
  }),
  maxAmountMinor: minorUnits,
  currency,
  expiresAt: z.string().datetime({ offset: true }),
});

export type MandateView = z.infer<typeof mandateViewSchema>;

export const flightOfferSchema = z.strictObject({
  offerId: id,
  merchantId: id,
  category: z.literal('flight'),
  destination: z.string().trim().min(1).max(200),
  amountMinor: minorUnits,
  currency,
  available: z.boolean(),
  untrustedContent: z.string().max(2_000),
});

export type FlightOffer = z.infer<typeof flightOfferSchema>;

export const flightSelectionSchema = z.strictObject({
  selectedOfferId: id,
  rationale: z.string().trim().min(1).max(500),
  semanticEscalationRequested: z.boolean(),
});

export type FlightSelection = z.infer<typeof flightSelectionSchema>;

export const selectedOfferClaimSchema = flightOfferSchema.omit({
  untrustedContent: true,
  available: true,
});

export const agentClaimSchema = z.strictObject({
  goal: z.string().trim().min(1).max(2_000),
  selectedOffer: selectedOfferClaimSchema,
  consideredOfferIds: z.array(id).min(1).max(100),
  rationale: z.string().trim().min(1).max(500),
  semanticEscalationRequested: z.boolean(),
});

export type AgentClaim = z.infer<typeof agentClaimSchema>;

export const purchaseIntentSchema = z.strictObject({
  schemaVersion: z.literal('purchase-intent-v1'),
  runId: z.string().uuid(),
  mandate: z.strictObject({
    id,
    version: z.number().int().positive().safe(),
  }),
  offer: selectedOfferClaimSchema,
  agentClaim: agentClaimSchema,
});

export type PurchaseIntent = z.infer<typeof purchaseIntentSchema>;

export const resumeIntentSchema = z.strictObject({
  approvalResolutionId: id,
});

export type ResumeIntent = z.infer<typeof resumeIntentSchema>;

export const agentProofPayloadSchema = z.strictObject({
  agentId: id,
  agentKeyId: id,
  bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int().nonnegative().safe(),
  issuedAt: z.number().int().nonnegative().safe(),
  mandateId: id,
  mandateVersion: z.number().int().nonnegative().safe(),
  method: z.string().regex(/^[A-Z]+$/),
  nonce: z.string().regex(/^[A-Za-z0-9_-]+$/),
  path: z.string().startsWith('/').refine((value) => !/[\r\n]/.test(value)),
});

export const agentProofSchema = agentProofPayloadSchema.extend({
  signature: z.string().regex(/^[A-Za-z0-9_-]+$/),
});

export type AgentProofPayload = z.infer<typeof agentProofPayloadSchema>;
export type AgentProof = z.infer<typeof agentProofSchema>;

const receiptSchema = z.strictObject({
  reference: id,
  merchantId: id,
  offerId: id,
  amountMinor: minorUnits,
  currency,
});

export const allowedResultSchema = z.strictObject({
  outcome: z.literal('allowed'),
  attemptId: id,
  receipt: receiptSchema,
});

export const rejectedResultSchema = z.strictObject({
  outcome: z.literal('rejected'),
  attemptId: id.optional(),
  reasonCode: z.string().regex(/^[A-Z0-9_]+$/),
  message: z.string().trim().min(1).max(500),
});

export const escalationRequiredResultSchema = z.strictObject({
  outcome: z.literal('escalation_required'),
  attemptId: id,
  approvalRequest: z.strictObject({
    approvalRequestId: id,
    requestedAmountMinor: minorUnits,
    mandateLimitMinor: minorUnits,
    currency,
    reason: z.string().trim().min(1).max(500),
  }),
});

export const verificationResultSchema = z.discriminatedUnion('outcome', [
  allowedResultSchema,
  rejectedResultSchema,
  escalationRequiredResultSchema,
]);

export const resumeVerificationResultSchema = z.discriminatedUnion('outcome', [
  allowedResultSchema,
  rejectedResultSchema,
]);

export type VerificationResult = z.infer<typeof verificationResultSchema>;
export type ResumeVerificationResult = z.infer<typeof resumeVerificationResultSchema>;

export const startRunRequestSchema = z.strictObject({
  goal: z.string().trim().min(1).max(2_000),
  mandateId: id,
  conversationId: id.optional(),
  ownerId: z.string().uuid().optional(),
  agentIdentityId: z.string().uuid().optional(),
  agentSigningKeyId: z.string().uuid().optional(),
});

export const resumeRunRequestSchema = z.strictObject({
  approvalResolutionId: id.optional(),
  extensionId: z.string().uuid().optional(),
}).refine((value) => Boolean(value.approvalResolutionId || value.extensionId), {
  message: 'An approval resolution or extension is required.',
});

export type StartRunRequest = z.infer<typeof startRunRequestSchema>;
export type ResumeRunRequest = z.infer<typeof resumeRunRequestSchema>;

export const runStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_for_human',
  'completed',
  'rejected',
  'failed',
]);

export type RunStatus = z.infer<typeof runStatusSchema>;

export const eventTypeSchema = z.enum([
  'run_started',
  'conversation_context_loaded',
  'mandate_loaded',
  'offers_discovered',
  'offer_selected',
  'purchase_presented',
  'human_approval_required',
  'purchase_completed',
  'purchase_rejected',
  'run_failed',
]);

export type RunEventType = z.infer<typeof eventTypeSchema>;

export interface RunEvent {
  sequence: number;
  type: RunEventType;
  occurredAt: string;
  data: Record<string, unknown>;
}

export type TerminalResult =
  | { outcome: 'allowed'; attemptId: string; receipt: z.infer<typeof receiptSchema> }
  | { outcome: 'rejected'; attemptId?: string; reasonCode: string; message: string }
  | { outcome: 'no_offer'; message: string }
  | { outcome: 'failed'; code: string; message: string };

export interface PublicRun {
  runId: string;
  status: RunStatus;
  goal: string;
  mandateId: string;
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
  events: RunEvent[];
  result?: TerminalResult;
  approvalRequest?: z.infer<typeof escalationRequiredResultSchema>['approvalRequest'] & {
    attemptId: string;
  };
}
