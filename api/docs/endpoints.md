# API endpoint reference

This document describes the HTTP surface implemented by the Express API. It is written for an agent or separate client module. It describes current runtime behavior, not a proposed marketplace API.

Base URL is the deployed API origin, for example `https://api.example.com`.

## Integration rules

- Send normal HTTP requests to the Express API, not directly to Supabase tables or RPC endpoints.
- Treat a `402` response as an MPP payment challenge. The MPP client must process the `WWW-Authenticate: Payment ...` header and retry the exact request with its resulting payment credential.
- Do not send Stripe secret keys, Supabase secret keys, MPP secrets, passkey private material, or agent signing private keys in requests.
- All responses use JSON except payment challenge metadata carried in HTTP headers.

All agent and mandate management routes require a passkey session token in `Authorization: Bearer <sessionToken>`. The server derives the owner from that session. Never send an `ownerId` as an authority claim.

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

The document declares static and agent-management routes. Database-backed catalog paths remain dynamic, so this Markdown file is the source of truth for the complete routing behavior.

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
{"verified": true, "credentialId": "credential-id-string", "sessionToken": "opaque-signed-token", "sessionExpiresAt": 1735689900000}
```

`sessionToken` is returned only after successful verification. Store it only in memory, send it as `Authorization: Bearer <sessionToken>`, and revoke it when the user signs out.

**Failure responses**

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{"error":"userId and response are required"}` | Missing fields. |
| `400` | `{"error":"authentication_failed","detail":"..."}` | Verification failed, no pending challenge, or credential not found. |

### `POST /passkey/session/verify`

Request body:

```json
{"sessionToken": "opaque-signed-token"}
```

Returns `{"valid":true,"userId":"...","expiresAt":1735689900000}` or `401 {"error":"session_invalid"}`. Session tokens expire after five minutes.

### `POST /passkey/session/revoke`

Request body:

```json
{"sessionToken": "opaque-signed-token"}
```

Deletes the server-side session and returns `{"revoked":true}`.

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

## Agent identities and mandates

All routes in this section require `Authorization: Bearer <sessionToken>`. The session token comes from successful passkey authentication. The server derives the owner from the session, so no route accepts an owner ID from the client.

**Deployment prerequisite:** apply `20260829201500_agent_identity_proofs.sql` and `20260829213000_agent_managed_signing_keys.sql` before enabling these routes. The current Supabase environment cannot apply DDL from this host, so use the Supabase SQL Editor or approved migration pipeline. Also replace the in-memory passkey and session stores before using multiple API instances or restarting a production instance.

### `POST /v1/agents`

Registers an active agent identity and its public Ed25519 verification key. The private key is never sent to or stored by the API.

```json
{
  "displayName": "Research buyer",
  "publicKeyJwk": {"kty": "OKP", "crv": "Ed25519", "x": "..."}
}
```

The response contains the agent identity and signing-key IDs. The server fingerprints the public JWK. Agent keys use `agent_managed` custody in the database.

### `GET /v1/agents`

Lists the authenticated user's agents.

### `GET /v1/agents/{id}`

Returns one agent only when it belongs to the authenticated user.

### `PATCH /v1/agents/{id}/status`

Changes an owned agent's status:

```json
{"status": "suspended"}
```

Accepted values: `active`, `suspended`, `revoked`. Suspended or revoked agents cannot pass cross-credential authorization.

### `POST /v1/mandates`

Creates an agent mandate. The target agent must belong to the authenticated user.

```json
{
  "agentIdentityId": "agent-uuid",
  "scope": {
    "allowedProductSlugs": ["market-signal-sandbox"],
    "guidelines": ["Only buy market signals needed for the current task"]
  },
  "maxAmountMinor": 500,
  "currency": "usd",
  "expiresAt": "2026-12-31T23:59:59.000Z"
}
```

`maxAmountMinor` is a per-purchase ceiling in the currency's minor unit. `allowedProductSlugs`, when present and non-empty, is an allowlist. The API rejects any purchase outside either constraint.

### `GET /v1/mandates`

Lists mandates owned by the authenticated user.

### `GET /v1/mandates/{id}`

Returns one owned mandate.

### `POST /v1/mandates/{id}/revoke`

Revokes one owned mandate. Future agent proofs referring to it are rejected.

### `GET /v1/agents/{id}/activity`

Returns verified execution-proof activity for an owned agent. It never returns an agent private key or raw payment credential.

## Agent purchase endpoint

### `POST /v1/products/{slug}/purchase`

This is the only agent purchase entry point. It requires both:

1. A valid passkey session in `Authorization: Bearer <sessionToken>`.
2. A valid, short-lived Ed25519 `agentProof` bound to the request method, path, mandate ID/version, nonce, expiry, and the canonicalized `intent` body.

```json
{
  "intent": {
    "purpose": "buy a market signal for the current task"
  },
  "agentProof": {
    "agentId": "agent-uuid",
    "agentKeyId": "signing-key-uuid",
    "bodySha256": "<sha256 of canonical intent JSON>",
    "issuedAt": 1735689600,
    "expiresAt": 1735689720,
    "mandateId": "mandate-uuid",
    "mandateVersion": 1,
    "method": "POST",
    "path": "/v1/products/market-signal-sandbox/purchase",
    "nonce": "base64url-random-value",
    "signature": "base64url-ed25519-signature"
  }
}
```

Canonical intent JSON recursively sorts object keys, preserves array order, and serializes JSON primitives without whitespace. The agent must sign the exact canonical intent digest. It must not sign a body containing the session token or its own signature.

The server checks all of the following before starting MPP:

- Passkey session is valid and its user owns the agent.
- Agent identity and the claimed signing key are active.
- Ed25519 signature, body digest, method, path, expiry, and mandate version match.
- Mandate is active, unexpired, owned by the session user, and belongs to the agent.
- Product slug is in the mandate allowlist when one exists.
- Product price does not exceed `maxAmountMinor`.
- The proof nonce is persisted once. Replay attempts are rejected by the database.

On success, the endpoint forwards to Stripe MPP and returns its `402` payment challenge. The client retries this same endpoint with the MPP payment credential and a fresh, valid agent proof. The response includes `X-Agent-Execution-Proof-Id` for audit correlation.

### `GET /v1/payments`

Returns recent payment attempts connected to mandates owned by the authenticated user. Direct catalog payments without an agent execution proof are intentionally excluded because they cannot be safely attributed to a passkey user.

### `GET /v1/payments/{id}`

Returns a payment attempt only if it is connected to a mandate owned by the authenticated user. Unknown and foreign payment IDs both return `404`.

## Errors

| Status | Body or header | Meaning |
| --- | --- | --- |
| `400` | `{"error":"..."}` | Missing or invalid fields, invalid JSON, or malformed passkey input. |
| `401` | `{"error":"authentication_required"}` | No valid passkey session token was supplied. |
| `401` | `{"error":"authorization_denied"}` | Agent proof, signing key, agent state, or session ownership check failed. |
| `402` | `WWW-Authenticate: Payment ...` | Stripe MPP payment credential is required or did not pass verification. |
| `403` | `{"error":"mandate_violation"}` | The mandate is expired, revoked, out of scope, or below the required price limit. |
| `404` | `{"error":"not_found"}` | No static route matched, Supabase is unavailable, or no enabled catalog endpoint matches. |
| `404` | `{"error":"agent_not_found"}` / `{"error":"mandate_not_found"}` | Resource does not exist or does not belong to the authenticated user. |
| `404` | `{"error":"product_endpoint_not_found"}` | The requested product has no enabled Stripe MPP endpoint. |
| `500` | `{"error":"refund_failed","detail":"..."}` | Stripe refund API call failed. |
| `503` | `{"error":"payment_audit_unavailable"}` | A Stripe MPP catalog endpoint resolved but the payment audit store is unavailable. |
| `503` | `{"error":"payment_rail_unavailable"}` | An enabled offering uses a payment rail with no configured handler. |

A Stripe MPP catalog offering whose stored Stripe Profile differs from the API's configured `STRIPE_PROFILE_ID` fails server-side rather than being charged. This is an operator configuration error, not a client retry condition.

## Client module boundary

A frontend owns WebAuthn browser calls and forwards their results to the passkey endpoints. An agent owns only its Ed25519 private key, the canonical purchase intent, its signature, and MPP credential handling.

Neither frontend nor agent may activate products, manage Supabase directly, write payment audits, create server-side sessions, decide mandate scope for another user, or access an agent private key outside its own custody.
