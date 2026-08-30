interface DashboardProjection {
  summary: unknown;
  dailySales: unknown[];
  recentOrders: unknown[];
}

export interface DemoDashboardProjection extends DashboardProjection {
  demo: true;
}

const DAILY_GMV_MINOR = [
  612_400, 734_800, 689_500, 845_200, 792_100, 945_600, 884_300, 1_024_500, 756_900, 831_200,
  964_500, 1_102_800, 915_400, 978_600, 1_047_200, 869_300, 1_125_400, 1_189_200, 1_064_800, 1_237_600,
  995_300, 1_284_100, 1_176_600, 1_358_200, 1_219_400, 1_425_600, 1_317_800, 1_492_600, 1_587_400, 1_648_900,
];

const PRODUCTS = [
  { name: 'AI Procurement Suite — Annual', slug: 'ai-procurement-suite-annual', amountMinor: 1_250_000 },
  { name: 'Operations Analytics Enterprise', slug: 'operations-analytics-enterprise', amountMinor: 890_000 },
  { name: 'Secure Agent Gateway', slug: 'secure-agent-gateway', amountMinor: 650_000 },
  { name: 'Compliance Evidence Vault', slug: 'compliance-evidence-vault', amountMinor: 425_000 },
  { name: 'Global Catalog Sync', slug: 'global-catalog-sync', amountMinor: 1_175_000 },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function dateDaysAgo(now: Date, daysAgo: number, hour = 15): string {
  const value = new Date(now);
  value.setUTCHours(hour, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() - daysAgo);
  return value.toISOString();
}

function demoDailySales(now: Date): Array<Record<string, unknown>> {
  return DAILY_GMV_MINOR.map((gmvMinor, index) => ({
    sale_date: dateDaysAgo(now, DAILY_GMV_MINOR.length - 1 - index, 0).slice(0, 10),
    gmv_minor: gmvMinor,
    settled_orders: Math.max(1, Math.round(gmvMinor / 17_500)),
    currency: 'usd',
  }));
}

function demoOrders(now: Date): Array<Record<string, unknown>> {
  return PRODUCTS.map((product, index) => {
    const status = index === 3 ? 'refunded' : 'settled';
    const createdAt = dateDaysAgo(now, index, 16 - index);
    return {
      order_id: `d000000${index + 1}-0000-4000-8000-00000000000${index + 1}`,
      product_id: `e000000${index + 1}-0000-4000-8000-00000000000${index + 1}`,
      product_name: product.name,
      product_slug: product.slug,
      status,
      amount_minor: product.amountMinor,
      currency: 'usd',
      scale: 2,
      provider_payment_id: `pi_demo_corporate_${index + 1}`,
      receipt: {
        method: 'stripe_mpp',
        reference: `demo-corp-receipt-${index + 1}`,
        status: 'success',
        timestamp: createdAt,
      },
      failure_code: null,
      agent_execution_proof_id: `demo-corporate-proof-${index + 1}`,
      risk_level: index === 2 ? 'medium' : 'low',
      risk_reasons: index === 2
        ? ['high_value_order', 'new_agent_relationship', 'mandate_verified']
        : ['mandate_verified', 'fixed_price_match', 'known_agent'],
      created_at: createdAt,
      settled_at: dateDaysAgo(now, index, 17 - index),
    };
  });
}

function mergeDailySales(actual: unknown[], demo: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const merged = new Map(demo.map((row) => [String(row.sale_date), { ...row }]));
  for (const candidate of actual) {
    if (!isRecord(candidate) || typeof candidate.sale_date !== 'string') continue;
    const key = candidate.sale_date.slice(0, 10);
    const baseline = merged.get(key) ?? { sale_date: key, gmv_minor: 0, settled_orders: 0, currency: 'usd' };
    merged.set(key, {
      ...baseline,
      gmv_minor: numeric(baseline.gmv_minor) + numeric(candidate.gmv_minor),
      settled_orders: numeric(baseline.settled_orders) + numeric(candidate.settled_orders),
      currency: typeof candidate.currency === 'string' ? candidate.currency : baseline.currency,
    });
  }
  return [...merged.values()].sort((left, right) => String(left.sale_date).localeCompare(String(right.sale_date)));
}

function mergeRecentOrders(actual: unknown[], demo: Array<Record<string, unknown>>): unknown[] {
  const merged = new Map<string, unknown>();
  for (const order of [...actual, ...demo]) {
    if (!isRecord(order) || typeof order.order_id !== 'string') continue;
    if (!merged.has(order.order_id)) merged.set(order.order_id, order);
  }
  return [...merged.values()]
    .sort((left, right) => {
      const leftDate = isRecord(left) && typeof left.created_at === 'string' ? left.created_at : '';
      const rightDate = isRecord(right) && typeof right.created_at === 'string' ? right.created_at : '';
      return rightDate.localeCompare(leftDate);
    })
    .slice(0, 5);
}

export function augmentMerchantDashboard(projection: DashboardProjection, now = new Date()): DemoDashboardProjection {
  const demoSales = demoDailySales(now);
  const dailySales = mergeDailySales(projection.dailySales, demoSales);
  const actual = isRecord(projection.summary) ? projection.summary : {};
  const demoGmv = demoSales.reduce((total, row) => total + numeric(row.gmv_minor), 0);
  const demoSettled = demoSales.reduce((total, row) => total + numeric(row.settled_orders), 0);
  const settledOrders = demoSettled + numeric(actual.settled_orders);
  const refundedOrders = 18 + numeric(actual.refunded_orders);
  const convertedOrders = demoSettled + 18 + numeric(actual.converted_orders);
  const agentAttempts = demoSettled + 18 + 274 + numeric(actual.agent_attempts);

  return {
    demo: true,
    summary: {
      ...actual,
      gmv_minor: demoGmv + numeric(actual.gmv_minor),
      currency: typeof actual.currency === 'string' ? actual.currency : 'usd',
      settled_orders: settledOrders,
      agent_attempts: agentAttempts,
      converted_orders: convertedOrders,
      agent_conversion_rate: agentAttempts === 0 ? 0 : (convertedOrders / agentAttempts) * 100,
      refunded_orders: refundedOrders,
      failed_orders: 37 + numeric(actual.failed_orders),
      gmv_growth_rate: 18.4,
      conversion_growth_points: 6.8,
      automation_rate: 92.7,
      average_order_value_minor: settledOrders === 0 ? 0 : Math.round((demoGmv + numeric(actual.gmv_minor)) / settledOrders),
    },
    dailySales,
    recentOrders: mergeRecentOrders(projection.recentOrders, demoOrders(now)),
  };
}
