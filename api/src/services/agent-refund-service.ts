import type { PaymentAttemptRecord } from '../domain/types.js';
import type { RefundRequest, RefundResult } from './refund-service.js';

export type RefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer';

export interface AgentRefundIntent {
  selection: 'latest' | 'payment';
  paymentAttemptId: string | null;
  reason: RefundReason;
}

export interface AgentRefundResult extends RefundResult {
  paymentAttemptId: string;
  scale: number;
}

export interface PaymentHistoryForRefunds {
  listPaymentAttempts(ownerId: string, limit?: number): Promise<PaymentAttemptRecord[]>;
  getPaymentAttempt(ownerId: string, id: string): Promise<PaymentAttemptRecord | null>;
  markRefunded(ownerId: string, paymentId: string, refundId: string): Promise<boolean>;
}

export interface RefundProvider {
  refund(request: RefundRequest): Promise<RefundResult>;
}

export class AgentRefundError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AgentRefundError';
  }
}

export class AgentRefundService {
  constructor(
    private readonly payments: PaymentHistoryForRefunds,
    private readonly provider: RefundProvider,
  ) {}

  async refund(ownerId: string, intent: AgentRefundIntent): Promise<AgentRefundResult> {
    const attempt = intent.selection === 'payment'
      ? await this.explicitPayment(ownerId, intent.paymentAttemptId)
      : await this.latestPayment(ownerId);

    if (attempt.status === 'refunded') {
      throw new AgentRefundError(
        'Your most recent refundable payment has already been refunded.',
        'PAYMENT_ALREADY_REFUNDED',
        409,
      );
    }
    if (attempt.status !== 'settled' || !attempt.providerPaymentId) {
      throw new AgentRefundError(
        'That payment is not eligible for a Stripe refund.',
        'REFUND_NOT_AVAILABLE',
        409,
      );
    }

    let refund: RefundResult;
    try {
      refund = await this.provider.refund({
        paymentIntentId: attempt.providerPaymentId,
        reason: intent.reason,
        idempotencyKey: `agent-refund:${attempt.id}`,
      });
    } catch (error) {
      console.error('Stripe refund request failed.', {
        paymentAttemptId: attempt.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AgentRefundError(
        'Stripe could not process the refund. Please retry shortly.',
        'REFUND_PROVIDER_FAILED',
        502,
      );
    }

    if (refund.status === 'failed' || refund.status === 'canceled') {
      throw new AgentRefundError(
        'Stripe did not accept the refund. Please contact support.',
        'REFUND_PROVIDER_FAILED',
        502,
      );
    }

    try {
      const updated = await this.payments.markRefunded(ownerId, attempt.id, refund.id);
      if (!updated) throw new Error('The owner-scoped payment update matched no record.');
    } catch (error) {
      // Stripe is the payment authority. Once it accepted the idempotent
      // refund, return that result and leave a reconciliation signal instead
      // of inviting the user to submit a second refund request.
      console.error('Refund reconciliation failed after Stripe accepted the request.', {
        paymentAttemptId: attempt.id,
        refundId: refund.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { ...refund, paymentAttemptId: attempt.id, scale: attempt.scale };
  }

  private async explicitPayment(ownerId: string, paymentAttemptId: string | null): Promise<PaymentAttemptRecord> {
    if (!paymentAttemptId) {
      throw new AgentRefundError('A payment ID is required.', 'PAYMENT_ID_REQUIRED', 400);
    }
    const attempt = await this.payments.getPaymentAttempt(ownerId, paymentAttemptId);
    if (!attempt) {
      throw new AgentRefundError(
        'No payment with that ID belongs to your account.',
        'PAYMENT_NOT_FOUND',
        404,
      );
    }
    return attempt;
  }

  private async latestPayment(ownerId: string): Promise<PaymentAttemptRecord> {
    const attempts = await this.payments.listPaymentAttempts(ownerId, 50);
    // Include an already-refunded latest payment in the selection. Otherwise a
    // browser retry could silently move on and refund the next older purchase.
    const attempt = attempts.find((candidate) =>
      Boolean(candidate.providerPaymentId)
      && (candidate.status === 'settled' || candidate.status === 'refunded'));
    if (!attempt) {
      throw new AgentRefundError(
        'No refundable Stripe payment was found for your account.',
        'REFUNDABLE_PAYMENT_NOT_FOUND',
        404,
      );
    }
    return attempt;
  }
}
