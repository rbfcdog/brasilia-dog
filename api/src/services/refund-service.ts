import Stripe from 'stripe';

export interface RefundRequest {
  paymentIntentId: string;
  amount?: number;
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  idempotencyKey?: string;
}

export interface RefundResult {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paymentIntentId: string;
  reason: string | null;
}

export class RefundService {
  private readonly stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async refund({ paymentIntentId, amount, reason, idempotencyKey }: RefundRequest): Promise<RefundResult> {
    const refund = await this.stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amount ? { amount } : {}),
      ...(reason ? { reason } : {}),
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    });

    return {
      id: refund.id,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status ?? 'pending',
      paymentIntentId,
      reason: refund.reason ?? null,
    };
  }

  async retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }
}
