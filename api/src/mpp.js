import Stripe from 'stripe';
import { Mppx, stripe } from 'mppx/server';

const PAID_RESOURCE = Object.freeze({
  data: {
    description: 'Controlled Stripe MPP sandbox resource',
  },
});

export function createPaidHandler(config) {
  const client = new Stripe(config.stripeSecretKey, {
    apiVersion: '2026-05-27.preview',
  });
  const mppx = Mppx.create({
    methods: [stripe.charge({
      client,
      networkId: config.stripeProfileId,
      paymentMethodTypes: ['card', 'link'],
      decimals: 2,
    })],
    secretKey: config.mppSecretKey,
  });
  const charge = mppx.charge({ amount: '0.50', currency: 'usd' });

  return async function paidHandler(request) {
    const result = await charge(request);

    if (result.status === 402) {
      return result.challenge;
    }

    return result.withReceipt(Response.json(PAID_RESOURCE));
  };
}
