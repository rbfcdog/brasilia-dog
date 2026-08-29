# API endpoint reference

This document describes the HTTP surface implemented by the Express API. It is written for an agent or separate client module. It describes current runtime behavior, not a proposed marketplace API.

Base URL is the deployed API origin, for example `https://api.example.com`.

## Integration rules

- Send normal HTTP requests to the Express API, not directly to Supabase tables or RPC endpoints.
- Treat a `402` response as an MPP payment challenge. The MPP client must process the `WWW-Authenticate: Payment ...` header and retry the exact request with its resulting payment credential.
- Do not send Stripe secret keys, Supabase secret keys, MPP secrets, passkey private material, or agent signing private keys in requests.
- All responses use JSON except payment challenge metadata carried in HTTP headers.

The API currently enables permissive CORS (`Access-Control-Allow-Origin: *`) for initial browser integration. Do not send credentialed requests to it until production origins are configured.

## Always available

### `GET /health`

Unauthenticated readiness endpoint. It does not call the payment handler or Supabase.

**Success response**

```http
HTTP/1.1 200 OK
content-type: application/json

{"status":"ok"}
```

Use this endpoint for deployment health checks only.

### `GET /openapi.json`

Unauthenticated static OpenAPI 3.1 document.

**Success response**

```http
HTTP/1.1 200 OK
content-type: application/json
```

The document declares all currently implemented routes: `/paid`, `/passkey/*`, `/refund`, and `/v1/products/{slug}/info`. It does not dynamically include database-backed product endpoints, so this Markdown file is the source of truth for the full currently implemented routing behavior.

### `GET /paid`

Controlled Stripe MPP sandbox resource. Price is fixed in code at 50 USD cents.

**First request without payment**

```http
HTTP/1.1 402 Payment Required
content-type: application/problem+json
www-authenticate: Payment ...
```

The `WWW-Authenticate` challenge identifies the Stripe MPP method, configured Stripe Profile, requested amount, currency, payment methods (`card`, `link`), and expiry. The challenge is short-lived and bound to this request flow.

**Paid request**

After a valid MPP payment credential, retry `GET /paid`. MPP verifies it and the API returns:

```http
HTTP/1.1 200 OK
content-type: application/json

{"data":{"description":"Controlled Stripe MPP sandbox resource"}}
```

The MPP library attaches payment-receipt metadata to the paid response. A successful sandbox request proves the sandbox flow only. It does not authorize an external marketplace payment.

## Database-backed product endpoints

The following routing exists only when all conditions are true:

1. The API has `SUPABASE_URL` and a server-only Supabase credential configured.
2. The product-payment migrations have been applied.
3. A matching `product_endpoints` row is enabled.
4. Its linked offering is active and its product status is `published`.

### `GET|POST /v1/products/{product-slug}/{payment-rail}`

This is a routing pattern, not a promise that every possible path exists. The API reads the exact HTTP method and path from `product_endpoints`; it does not derive a product endpoint from a slug alone.

The product endpoint defines its successful status code and JSON response body. For a Stripe MPP offering, the requested price, currency, and Stripe Profile come from the matching offering.

**Stripe MPP request sequence**

1. Call the exact configured path without a payment credential.
2. Receive `402` with a `WWW-Authenticate: Payment ...` challenge.
3. Pay through an MPP-capable client.
4. Retry the same method and path with the payment credential.
5. Receive the configured 2xx JSON resource response.

On successful Stripe MPP payment, the API records receipt metadata and a hashed request authorization value in the server-side payment audit store. It does not persist the raw payment credential.

**Payment rail restriction**

Only Stripe MPP offerings are supported. `stellar_x402` is not a Stripe payment rail and must remain inactive. Do not activate or route a Stellar x402 offering through this API.

### Active product: market-signal-sandbox

The remote database contains this published product with an active Stripe MPP offering:

| Field | Value |
| --- | --- |
| Product slug | `market-signal-sandbox` |
| Status | `published` |
| Offering rail | `stripe_mpp` |
| Amount | 50 (USD cents) |
| Offering active | `true` |
| Endpoint method | `GET` |
| Endpoint path | `/v1/products/market-signal-sandbox/mpp` |
| Endpoint enabled | `true` |
| Response body | `{"data":"market-signal-sandbox-resource","signal":"MPP/USDC test","timestamp":"..."}` |

Calling `GET /v1/products/market-signal-sandbox/mpp` without a payment credential returns `402` with a Stripe MPP challenge. After payment, the API returns the configured JSON resource.

The `seed.sql` and catalog migration force this product back to inactive `draft` state on re-run. The current active state was set manually after seeding.

## Passkey (WebAuthn) endpoints

The API generates and verifies WebAuthn registration and authentication options using `@simplewebauthn/server`. Credentials are stored in an in-memory store during development. A Supabase migration (`20260829150000_passkey_credentials.sql`) defines a durable table with RLS but is not yet wired into the runtime store.

### `POST /passkey/register/options`

Generates WebAuthn registration options for a user.

**Request body**

```json
{"userId": "user-1", "username": "alice"}
```

**Success response**

```http
HTTP/1.1 200 OK
content-type: application/json
```

Returns a `PublicKeyCredentialCreationOptionsJSON` object. The `challenge` field is stored server-side and must be presented during verification.

**Error responses**

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{"error":"userId and username are required"}` | Missing fields in request body. |

### `POST /passkey/register/verify`

Verifies the authenticator attestation response returned by the browser or agent.

**Request body**

```json
{"userId": "user-1", "response": "<AuthenticatorAttestationResponseJSON>"}
```

**Success response**

```json
{"verified": true, "credentialId": "credential-id-string"}
```

**Failure responses**

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{"error":"userId and response are required"}` | Missing fields. |
| `400` | `{"error":"registration_failed","detail":"..."}` | Verification failed or no pending challenge. |

### `POST /passkey/auth/options`

Generates WebAuthn authentication options for a user with registered credentials.

**Request body**

```json
{"userId": "user-1"}
```

**Success response**

Returns a `PublicKeyCredentialRequestOptionsJSON` object.

**Error responses**

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{"error":"userId is required"}` | Missing field. |

### `POST /passkey/auth/verify`

Verifies the authenticator assertion response.

**Request body**

```json
{"userId": "user-1", "response": "<AuthenticatorAssertionResponseJSON>"}
```

**Success response**

```json
{"verified": true, "credentialId": "credential-id-string"}
```

**Failure responses**

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{"error":"userId and response are required"}` | Missing fields. |
| `400` | `{"error":"authentication_failed","detail":"..."}` | Verification failed, no pending challenge, or credential not found. |

## Refund endpoint

### `POST /refund`

Issues a Stripe refund for a previously settled payment intent. The API uses the same `STRIPE_SECRET_KEY` as the payment flow.

**Request body**

```json
{"paymentIntentId": "pi_...", "amount": 50, "reason": "requested_by_customer"}
```

| Field | Required | Description |
| --- | --- | --- |
| `paymentIntentId` | Yes | Stripe Payment Intent ID to refund. |
| `amount` | No | Partial refund amount in the smallest currency unit (e.g. cents). Omit for a full refund. |
| `reason` | No | One of `duplicate`, `fraudulent`, or `requested_by_customer`. |

**Success response**

```http
HTTP/1.1 200 OK
content-type: application/json

{"id":"re_...","amount":50,"currency":"usd","status":"succeeded","paymentIntentId":"pi_...","reason":"requested_by_customer"}
```

**Error responses**

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{"error":"paymentIntentId is required"}` | Missing `paymentIntentId`. |
| `500` | `{"error":"refund_failed","detail":"..."}` | Stripe API rejected the refund request. |

This endpoint was validated against the Stripe sandbox: a payment intent was created, confirmed with `pm_card_visa`, and then refunded through the API endpoint with `status: "succeeded"`.

## Product info endpoint

### `GET /v1/products/{slug}/info`

Returns product metadata by slug, including name, description, and any stored metadata. This endpoint reads from the `products` table using the service-role client, so it returns products regardless of published status.

**Success response**

```http
HTTP/1.1 200 OK
content-type: application/json

{
  "product": {
    "id": "e4e4e3da-...",
    "slug": "market-signal-sandbox",
    "name": "Market signal sandbox",
    "description": "...",
    "metadata": {"category": "signals", "price_display": "$0.50", "seller": "sandbox-merchant"}
  }
}
```

**Error responses**

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{"error":"product slug is required"}` | Slug segment is empty. |
| `404` | `{"error":"product_not_found"}` | No product exists with the given slug. |

## Errors

| Status | Body or header | Meaning |
| --- | --- | --- |
| `400` | `{"error":"..."}` | Missing or invalid request fields for passkey, refund, or product info endpoints. |
| `402` | `WWW-Authenticate: Payment ...` | A Stripe MPP payment credential is required or has not passed verification. |
| `404` | `{"error":"not_found"}` | No static route matched, Supabase is not configured, or no enabled catalog endpoint matches. |
| `404` | `{"error":"product_not_found"}` | Product slug does not exist in the database. |
| `500` | `{"error":"refund_failed","detail":"..."}` | Stripe refund API call failed. |
| `503` | `{"error":"payment_audit_unavailable"}` | A Stripe MPP catalog endpoint resolved but the payment audit store is unavailable. |
| `503` | `{"error":"payment_rail_unavailable"}` | An enabled offering uses a payment rail with no configured handler. |

A Stripe MPP catalog offering whose stored Stripe Profile differs from the API's configured `STRIPE_PROFILE_ID` fails server-side rather than being charged. This is an operator configuration error, not a client retry condition.

## Client module boundary

A separate agent module should own only:

- Calling `GET /health` for readiness.
- Fetching `GET /openapi.json` for the current payment declaration.
- Fetching `GET /v1/products/{slug}/info` to discover product metadata.
- Processing MPP `402` challenges through its payment client.
- Retrying exactly once with the MPP payment credential and consuming the resulting JSON resource.
- Initiating passkey registration and authentication flows through `/passkey/*`.
- Requesting refunds through `POST /refund` when authorized.

It must not own product activation, payment settlement, Supabase admin access, payment-audit writes, mandate decisions, or agent signing-key custody.
