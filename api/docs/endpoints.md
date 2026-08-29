# API endpoint reference

This document describes the HTTP surface implemented by the Express API. It is written for an agent or separate client module. It describes current runtime behavior, not a proposed marketplace API.

Base URL is the deployed API origin, for example `https://api.example.com`.

## Integration rules

- Send normal HTTP requests to the Express API, not directly to Supabase tables or RPC endpoints.
- Treat a `402` response as an MPP payment challenge. The MPP client must process the `WWW-Authenticate: Payment ...` header and retry the exact request with its resulting payment credential.
- Do not send Stripe secret keys, Supabase secret keys, MPP secrets, passkey private material, or agent signing private keys in requests.
- There is no browser login, user-session, mandate, agent-identity, catalog-management, refund, or payment-history endpoint yet.
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

The current document declares only `GET /paid`. It does not dynamically include database-backed product endpoints, so this Markdown file is the source of truth for the full currently implemented routing behavior.

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

### Seeded, inactive example

The seed file defines this disabled endpoint for setup verification only:

| Method | Path | Rail | Status |
| --- | --- | --- | --- |
| `GET` | `/v1/products/market-signal-sandbox/mpp` | Stripe MPP | Disabled |

It returns `404` until its product is published and the offering and endpoint are activated.

## Errors

| Status | Body or header | Meaning |
| --- | --- | --- |
| `402` | `WWW-Authenticate: Payment ...` | A Stripe MPP payment credential is required or has not passed verification. |
| `404` | `{"error":"not_found"}` | No static route matched, Supabase is not configured, or no enabled catalog endpoint matches the request method and path. |
| `503` | `{"error":"payment_audit_unavailable"}` | A Stripe MPP catalog endpoint resolved but the payment audit store is unavailable. |
| `503` | `{"error":"payment_rail_unavailable"}` | An enabled offering uses a payment rail with no configured handler. |

A Stripe MPP catalog offering whose stored Stripe Profile differs from the API's configured `STRIPE_PROFILE_ID` fails server-side rather than being charged. This is an operator configuration error, not a client retry condition.

## Client module boundary

A separate agent module should own only:

- Calling `GET /health` for readiness.
- Fetching `GET /openapi.json` for the current static payment declaration.
- Discovering the exact product endpoint through a trusted catalog source.
- Processing MPP `402` challenges through its payment client.
- Retrying exactly once with the MPP payment credential and consuming the resulting JSON resource.

It must not own product activation, payment settlement, Supabase admin access, payment-audit writes, mandate decisions, or agent signing-key custody.
