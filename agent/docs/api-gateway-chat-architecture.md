# API-gateway chat architecture

## Status

Implemented. The Node API is now the sole chat orchestration boundary for
authenticated users.

## Current request path

```text
Browser
  -> Next.js BFF
  -> Node API POST /v1/chat
     -> verify passkey session
     -> create or resolve conversation
     -> persist user message
     -> call agent service POST /v1/chat
     -> resolve an owned payment and call Stripe (refund intents only)
     -> persist assistant message
     -> persist agent_response event
     -> persist mandate_proposed event (when applicable)
     -> persist refund_processed event (when applicable)
     -> return committed response with conversationId
```

Anonymous users fall back to a local-only path:

```text
Browser
  -> Next.js BFF POST /api/agent
  -> Agent service POST /v1/chat
  -> return response (no persistence)
```

## Authority boundary

The Node API remains the sole authority for identity, conversations, mandates,
approvals, products, payment attempts, and Stripe MPP execution. The agent
remains advisory. An agent response can request clarification, propose a
mandate, or classify an explicit refund intent. It cannot create an
authoritative mandate, approve one, choose a provider payment ID, or call
Stripe. For refunds, the Node API resolves the latest eligible payment through
the authenticated owner scope and calls Stripe with a payment-specific
idempotency key.

The browser never receives the agent service token, OpenAI key, Supabase
service-role key, payment credential, passkey private material, or biometric
material.

## Secret placement

```dotenv
# Next.js server
BACKEND_API_URL=https://api.example.com

# Node API
AGENT_SERVICE_URL=https://agent.example.com
AGENT_SERVICE_TOKEN=<api-to-agent-token>

# Agent service
AGENT_SERVICE_TOKEN=<same-api-to-agent-token>
OPENAI_API_KEY=<server-only-key>
```

The Next.js deployment no longer holds an agent token for authenticated chat.
It holds only `BACKEND_API_URL`. The anonymous local agent route retains the
agent token as a fallback for unauthenticated browsing.

## Request sequence (authenticated)

1. The browser sends a message to the Next.js BFF with its passkey session.
2. The BFF forwards the request to `POST /api/backend/v1/chat`.
3. The Node API verifies the passkey session.
4. The Node API creates or resolves the conversation and persists the user
   message.
5. The Node API calls the agent service with server-only authentication.
6. The agent returns a strict structured response.
7. For a refund intent, the Node API requires authentication, resolves an owned
   settled payment, and calls Stripe server-side.
8. The Node API persists the assistant message and structured events.
9. The BFF returns the authoritative result to the browser.

## Why this architecture

The previous architecture had the browser own persistence ordering. That
allowed chat turns to reach the agent without being committed to Supabase,
leaving conversations empty. Moving persistence behind the Node API guarantees
that every authenticated turn is committed before the browser receives it.
