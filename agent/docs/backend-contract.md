# Agent-to-backend REST contract

The agent reads persisted conversation history and the complete Stripe MPP product catalog from the authoritative Node backend. The flight search, signing, purchase, and approval routes below remain a proposed `ADAPTER_MODE=http` contract; the current API does not implement those routes. Use `ADAPTER_MODE=demo` with backend context variables for the supported purchase integration.

## Common rules

- Every request uses `Authorization: Bearer $AGENT_BACKEND_TOKEN`.
- The implemented conversation and product-catalog routes return direct JSON bodies. Proposed purchase routes use `{ "ok": true, "data": ... }`.
- A deterministic purchase decision is returned as successful protocol data. The agent reads only the `outcome` discriminant and never derives authorization from HTTP status.
- Currency codes are lowercase ISO-style three-letter strings. Amounts are non-negative integers in minor units.
- The backend revalidates agent identity, proof, nonce, mandate status/version/expiry/revocation, approval resolution, scope, and current offer price for every presentation.

## Implemented conversation context

```http
GET /v1/conversations/:id/messages
Authorization: Bearer $AGENT_BACKEND_TOKEN
```

`AGENT_BACKEND_TOKEN` must equal the API service's `AGENT_SERVICE_TOKEN`. The API returns:

```json
{
  "messages": [
    {
      "id": "message-id",
      "conversationId": "conversation-id",
      "role": "user",
      "content": "Find the cheapest authorized offer.",
      "createdAt": "2026-08-30T00:00:00.000Z"
    }
  ]
}
```

The agent accepts an optional `conversationId` when creating a run, requests this endpoint before selection, limits the transcript to the newest 20 messages and 6,000 characters, and passes it to the model only as untrusted data. It does not receive a user passkey credential, passkey session token, or payment credential.

## Implemented product catalog

```http
GET /v1/agent/products
Authorization: Bearer $AGENT_BACKEND_TOKEN
```

The API returns every current catalog record, including draft and inactive records, so the agent harness can inspect provisioning state without treating it as purchasable:

```json
{
  "products": [
    {
      "id": "product-id",
      "slug": "ultrawide-monitor-buying-guide",
      "name": "Ultrawide monitor buying guide",
      "description": "Current comparison data.",
      "status": "draft",
      "metadata": { "category": "electronics" },
      "offering": {
        "id": "offering-id",
        "rail": "stripe_mpp",
        "amountMinor": 250,
        "currency": "usd",
        "scale": 2,
        "networkId": "profile_test_example",
        "active": false
      },
      "endpoint": {
        "id": "endpoint-id",
        "method": "GET",
        "path": "/v1/products/ultrawide-monitor-buying-guide/mpp",
        "enabled": false
      }
    }
  ]
}
```

For marketplace queries, the agent uses the indexed search endpoint instead of downloading and filtering the catalog:

```http
POST /v1/agent/products/search
Authorization: Bearer $AGENT_BACKEND_TOKEN
Content-Type: application/json

{
  "query": "monitor",
  "category": "electronics",
  "maximumAmountMinor": 30000,
  "slugs": [],
  "limit": 10
}
```

The Node API executes the query through `search_agent_mpp_products`, using a weighted PostgreSQL `tsvector` GIN index plus indexed active-offering price filters. Results are ranked and bounded to at most 25 records. Category, maximum price, publication, offering activation, and endpoint activation are enforced in SQL.

Only entries with `status = published`, `offering.active = true`, and `endpoint.enabled = true` are purchasable. Catalog text and metadata remain untrusted. The backend re-resolves the endpoint and current offering before issuing a Stripe MPP challenge.

## 1. Safe mandate projection

```http
GET /v1/mandates/:id/agent-view
```

Response data:

```json
{
  "id": "mandate-vuelaya-cordoba",
  "version": 1,
  "agentId": "agent-marta-travel",
  "status": "active",
  "scope": { "category": "flight", "destination": "Córdoba" },
  "maxAmountMinor": 15000,
  "currency": "usd",
  "expiresAt": "2026-08-30T23:59:59.000Z"
}
```

No payment reference, WebAuthn credential, private key, raw card, or owner-private data belongs in this view.

## 2. Flight search

```http
POST /v1/catalog/flights/search
Content-Type: application/json
```

Request:

```json
{
  "goal": "Buy a flight to Córdoba below USD 150",
  "mandate": {
    "id": "mandate-vuelaya-cordoba",
    "version": 1,
    "agentId": "agent-marta-travel",
    "status": "active",
    "scope": { "category": "flight", "destination": "Córdoba" },
    "maxAmountMinor": 15000,
    "currency": "usd",
    "expiresAt": "2026-08-30T23:59:59.000Z"
  }
}
```

Response data is an array:

```json
[
  {
    "offerId": "vuelaya-cordoba-130",
    "merchantId": "vuelaya",
    "category": "flight",
    "destination": "Córdoba",
    "amountMinor": 13000,
    "currency": "usd",
    "available": true,
    "untrustedContent": "VuelaYa flight offer to Córdoba for USD 130."
  }
]
```

All catalog content is untrusted. The backend must look up the current offer and price again during purchase verification.

## 3. Remote signer

```http
POST /v1/agent-proofs/sign
Content-Type: application/json
```

Request:

```json
{
  "bodySha256": "64-lowercase-hex-characters",
  "mandateId": "mandate-vuelaya-cordoba",
  "mandateVersion": 1,
  "method": "POST",
  "path": "/v1/purchase-attempts",
  "nonce": "base64url-random-value",
  "issuedAt": 1788033600,
  "expiresAt": 1788033660
}
```

The signer authenticates the calling agent, resolves its active `agentId` and `agentKeyId`, and signs this exact canonical UTF-8 payload with Ed25519:

```text
agent-proof-v1
{agentId}
{agentKeyId}
{method}
{path}
{bodySha256}
{mandateId}
{mandateVersion}
{nonce}
{issuedAt}
{expiresAt}
```

Response data adds `agentId`, `agentKeyId`, and a base64url `signature`. The private key remains in backend KMS and is never returned.

## 4. Purchase presentation

```http
POST /v1/purchase-attempts
Idempotency-Key: UUID
X-Agent-Proof: base64url(JSON(agent-proof-v1))
Content-Type: application/json
```

The request body is the exact serialized `PurchaseIntent` whose SHA-256 appears in the proof:

```json
{
  "schemaVersion": "purchase-intent-v1",
  "runId": "UUID",
  "mandate": { "id": "mandate-vuelaya-cordoba", "version": 1 },
  "offer": {
    "offerId": "vuelaya-cordoba-130",
    "merchantId": "vuelaya",
    "category": "flight",
    "destination": "Córdoba",
    "amountMinor": 13000,
    "currency": "usd"
  },
  "agentClaim": {
    "goal": "Buy a flight to Córdoba below USD 150",
    "selectedOffer": {
      "offerId": "vuelaya-cordoba-130",
      "merchantId": "vuelaya",
      "category": "flight",
      "destination": "Córdoba",
      "amountMinor": 13000,
      "currency": "usd"
    },
    "consideredOfferIds": ["vuelaya-cordoba-130", "vuelaya-cordoba-300"],
    "rationale": "Short audit summary, not chain-of-thought.",
    "semanticEscalationRequested": false
  }
}
```

The agent serializes this object once, hashes those exact UTF-8 bytes, obtains a 60-second proof with a fresh nonce, and sends the same string without reserialization.

Response data is exactly one of:

```json
{
  "outcome": "allowed",
  "attemptId": "attempt-id",
  "receipt": {
    "reference": "receipt-id",
    "merchantId": "vuelaya",
    "offerId": "vuelaya-cordoba-130",
    "amountMinor": 13000,
    "currency": "usd"
  }
}
```

```json
{
  "outcome": "rejected",
  "attemptId": "attempt-id",
  "reasonCode": "MANDATE_REVOKED",
  "message": "The mandate has been revoked."
}
```

```json
{
  "outcome": "escalation_required",
  "attemptId": "attempt-id",
  "approvalRequest": {
    "approvalRequestId": "approval-request-id",
    "requestedAmountMinor": 30000,
    "mandateLimitMinor": 15000,
    "currency": "usd",
    "reason": "The agent requests 30000 minor units; the mandate limit is 15000."
  }
}
```

## 5. Resume after human resolution

The frontend/backend resolves the human action through a backend-owned route that is outside this agent contract. The backend returns an opaque `approvalResolutionId`; possession of that ID alone is not authorization.

```http
POST /v1/purchase-attempts/:attemptId/resume
Idempotency-Key: UUID
X-Agent-Proof: base64url(JSON(agent-proof-v1))
Content-Type: application/json

{"approvalResolutionId":"opaque-resolution-id"}
```

The resume body is serialized, hashed, and signed independently with a new nonce and a path bound to the attempt ID. Response data must be `allowed` or `rejected`; another escalation is invalid for this MVP contract.

Before allowing, the backend must validate that the resolution belongs to this pending attempt and action, then re-read the current mandate and offer. An approve-once resolution cannot override a later revocation, expiry, version change, identity failure, or stale price.

## Contract verification

`test/http-contract.test.ts` starts a local protocol stub and exercises all five routes through `HttpBackendAdapter`. It independently checks the exact raw body hash, Ed25519 signature, 60-second lifetime, method/path binding, new nonce, idempotency header, envelope, and result schemas without importing or contacting the real backend.
