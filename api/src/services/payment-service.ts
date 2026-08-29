import { createHash, randomUUID as createRandomUUID } from 'node:crypto';

import type {
  MppHandler,
  MppHandlerFactory,
  PaymentAttemptStore,
  PaymentReceiptSummary,
  ProductEndpoint,
} from '../domain/types.js';

function amountToDecimal(amountMinor: number, scale: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('Product offering amount must be a positive integer.');
  }

  if (!Number.isSafeInteger(scale) || scale < 0 || scale > 18) {
    throw new Error('Product offering scale is invalid.');
  }

  const divisor = 10 ** scale;
  return (amountMinor / divisor).toFixed(scale);
}

function fingerprintRequest(request: Request | undefined): string | null {
  const credential = request?.headers.get('authorization');

  if (!credential) {
    return null;
  }

  return createHash('sha256').update(credential).digest('hex');
}

function receiptSummary(receipt: PaymentReceiptSummary): PaymentReceiptSummary {
  return {
    method: receipt.method,
    reference: receipt.reference,
    ...(receipt.externalId ? { externalId: receipt.externalId } : {}),
    status: receipt.status,
    timestamp: receipt.timestamp,
  };
}

interface PaymentServiceOptions {
  stripeProfileId: string;
  mppHandlerFactory?: MppHandlerFactory;
  paymentAttemptRepository?: PaymentAttemptStore;
  randomUUID?: () => string;
}

export class PaymentService {
  private readonly stripeProfileId: string;
  private readonly mppHandlerFactory?: MppHandlerFactory;
  private readonly paymentAttemptRepository?: PaymentAttemptStore;
  private readonly randomUUID: () => string;
  private readonly mppHandlers = new Map<string, MppHandler>();

  constructor({
    stripeProfileId,
    mppHandlerFactory,
    paymentAttemptRepository,
    randomUUID = createRandomUUID,
  }: PaymentServiceOptions) {
    this.stripeProfileId = stripeProfileId;
    this.mppHandlerFactory = mppHandlerFactory;
    this.paymentAttemptRepository = paymentAttemptRepository;
    this.randomUUID = randomUUID;
  }

  async serve(endpoint: ProductEndpoint, request: Request): Promise<Response> {
    return this.serveMpp(endpoint, request);
  }

  async serveMpp(endpoint: ProductEndpoint, request: Request): Promise<Response> {
    if (endpoint.offering.networkId !== this.stripeProfileId) {
      throw new Error('Product offering does not match the configured Stripe Profile.');
    }

    const paymentAttemptRepository = this.paymentAttemptRepository;
    if (!paymentAttemptRepository) {
      return Response.json({ error: 'payment_audit_unavailable' }, { status: 503 });
    }

    if (!this.mppHandlerFactory) {
      return Response.json({ error: 'payment_rail_unavailable' }, { status: 503 });
    }

    let handler = this.mppHandlers.get(endpoint.id);
    if (!handler) {
      handler = this.mppHandlerFactory({
        amount: amountToDecimal(endpoint.offering.amountMinor, endpoint.offering.scale),
        currency: endpoint.offering.currency,
        resource: endpoint.responseBody,
        responseStatus: endpoint.responseStatus,
        onPaymentSuccess: async ({ input, receipt }) => {
          const summary = receiptSummary(receipt);
          await paymentAttemptRepository.record({
            productId: endpoint.product.id,
            offeringId: endpoint.offering.id,
            endpointId: endpoint.id,
            rail: 'stripe_mpp',
            providerPaymentId: summary.externalId ?? summary.reference,
            idempotencyKey: this.randomUUID(),
            status: 'settled',
            amountMinor: endpoint.offering.amountMinor,
            currency: endpoint.offering.currency,
            scale: endpoint.offering.scale,
            requestFingerprint: fingerprintRequest(input),
            receipt: summary,
          });
        },
      });
      this.mppHandlers.set(endpoint.id, handler);
    }

    return handler(request);
  }
}
