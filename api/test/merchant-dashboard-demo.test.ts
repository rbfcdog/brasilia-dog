import assert from 'node:assert/strict';
import test from 'node:test';

import { augmentMerchantDashboard } from '../src/services/merchant-dashboard-demo.js';

test('corporate sandbox dashboard adds a coherent thirty-day demo scenario', () => {
  const result = augmentMerchantDashboard(
    { summary: null, dailySales: [], recentOrders: [] },
    new Date('2026-08-30T20:00:00.000Z'),
  );
  const summary = result.summary as Record<string, number | string>;
  const dailySales = result.dailySales as Array<Record<string, number | string>>;
  const recentOrders = result.recentOrders as Array<Record<string, unknown>>;

  assert.equal(result.demo, true);
  assert.equal(dailySales.length, 30);
  assert.equal(recentOrders.length, 5);
  assert.equal(summary.currency, 'usd');
  assert.equal(summary.gmv_minor, dailySales.reduce((total, day) => total + Number(day.gmv_minor), 0));
  assert.equal(summary.settled_orders, dailySales.reduce((total, day) => total + Number(day.settled_orders), 0));
  assert.ok(Number(summary.agent_conversion_rate) > 80);
  assert.ok(Number(summary.gmv_growth_rate) > 0);
  assert.ok(Number(summary.automation_rate) > 90);
  assert.equal(dailySales[0]?.sale_date, '2026-08-01');
  assert.equal(dailySales.at(-1)?.sale_date, '2026-08-30');
});

test('corporate sandbox dashboard preserves and adds live sandbox projection values', () => {
  const result = augmentMerchantDashboard({
    summary: {
      gmv_minor: 100_000,
      currency: 'usd',
      settled_orders: 2,
      agent_attempts: 3,
      converted_orders: 2,
      refunded_orders: 1,
      failed_orders: 1,
    },
    dailySales: [{ sale_date: '2026-08-30', gmv_minor: 100_000, settled_orders: 2, currency: 'usd' }],
    recentOrders: [{ order_id: 'live-order', created_at: '2026-08-30T19:00:00.000Z' }],
  }, new Date('2026-08-30T20:00:00.000Z'));
  const summary = result.summary as Record<string, number>;
  const lastDay = result.dailySales.at(-1) as Record<string, number | string>;

  assert.equal(summary.gmv_minor, 32_217_200);
  assert.equal(summary.refunded_orders, 19);
  assert.equal(summary.failed_orders, 38);
  assert.equal(lastDay.gmv_minor, 1_748_900);
  assert.equal((result.recentOrders[0] as Record<string, unknown>).order_id, 'live-order');
});
