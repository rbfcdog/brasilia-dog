import Stripe from 'stripe';
import { Mppx, stripe } from 'mppx/server';

import type { AppConfig, MppHandler, MppHandlerOptions, PaymentReceiptSummary } from './types.js';

const PAID_RESOURCE = Object.freeze({
  data: {
    description: 'Controlled Stripe MPP sandbox resource',
  },
});

function summarizeReceipt(receipt: PaymentReceiptSummary): PaymentReceiptSummary {
  return {
    method: receipt.method,
    reference: receipt.reference,
    ...(receipt.externalId ? { externalId: receipt.externalId } : {}),
    status: receipt.status,
    timestamp: receipt.timestamp,
  };
}

export function createMppHandler(
  config: AppConfig,
  {
    amount,
    currency,
    resource,
    responseStatus = 200,
    onPaymentSuccess,
  }: MppHandlerOptions,
): MppHandler {
  const client = new Stripe(config.stripeSecretKey);
  const mppx = Mppx.create({
    methods: [stripe.charge({
      client,
      networkId: config.stripeProfileId,
      paymentMethodTypes: ['card', 'link'],
      decimals: 2,
    })],
    secretKey: config.mppSecretKey,
  });

  if (onPaymentSuccess) {
    mppx.onPaymentSuccess(async ({ input, receipt }) => {
      await onPaymentSuccess({
        input,
        receipt: summarizeReceipt(receipt),
      });
    });
  }

  const charge = mppx.charge({
    amount,
    currency,
    networkId: config.stripeProfileId,
    paymentMethodTypes: ['card', 'link'],
  });

  return async function paidHandler(request: Request): Promise<Response> {
    const result = await charge(request);

    if (result.status === 402) {
      return result.challenge;
    }

    return result.withReceipt(Response.json(resource, { status: responseStatus }));
  };
}

export function createPaidHandler(config: AppConfig): MppHandler {
  return createMppHandler(config, {
    amount: '0.50',
    currency: 'usd',
    resource: PAID_RESOURCE,
  });
}
