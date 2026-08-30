# Nomad Merchant platform

## Security boundary

Merchant identity is a Supabase Auth user with an active `merchant_profiles` row. The frontend receives only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Reads use security-invoker projections and underlying owner-scoped RLS policies. Authenticated users receive no table write policies and cannot call privileged catalog or refund RPCs.

The browser sends its short-lived Supabase access token to allowlisted `/api/backend/v1/merchant/*` commands. The Node API validates the token, derives `owner_id`, and uses the server-only Supabase client to call atomic RPCs. Buyer passkey tokens and Merchant Supabase tokens are intentionally separate.

## Projections

- `merchant_dashboard_projection`: one 30-day metric row with GMV, order counts, verified-agent attempts, conversion, refunds, and failures.
- `merchant_daily_sales_projection`: settled/refunded daily gross volume for the 30-day chart.
- `merchant_orders_projection`: product, receipt, proof, payment status, and deterministic risk reasons per attempt.
- `merchant_order_audit_projection`: chronological audit events scoped through the owned payment attempt.
- `merchant_catalog_projection`: owned product plus its fixed-price offering and endpoint activation state.
- `merchant_finance_projection`: settled/refunded receipts with latest refund-case status.
- `merchant_refund_cases_projection`: owned operations cases and requested amounts.

GMV includes attempts currently settled or refunded because it measures gross converted volume. Agent conversion is `(settled + subsequently refunded) / (challenged + settled + refunded + failed)` for attempts with an execution proof.

Risk is rules-based and auditable: failures, failure codes, or missing receipts after settlement are high; open challenges or missing agent proof are medium; a settled/refunded attempt with proof and receipt is low. Reason codes are always exposed with the level.

## Commands

- `POST /v1/merchant/products` creates an owned draft, inactive USD Stripe MPP offering, and disabled endpoint. The server supplies the Stripe profile.
- `POST /v1/merchant/products/:id/publish` validates ownership and completeness, then activates all three records atomically.
- `POST /v1/merchant/refund-cases` records a pending, full or partial request against an owned settled receipt.

The Merchant frontend never calls `/refund`. Creating a refund case does not call Stripe, change the payment attempt, or authorize funds movement.
