# Deferred API-gateway chat architecture

## Status

This is a future architecture proposal. It is not the current request path and must not be represented as implemented.

The current chat path is:

```text
Browser -> Next.js BFF -> Agent service -> OpenAI
                              |
                              +-> Node API for optional conversation context
```

The proposed path is:

```text
Browser -> Next.js BFF -> Node API -> Agent service -> OpenAI
                                  |
                                  +-> Supabase/Postgres
```

## Intended authority boundary

The Node API remains the sole authority for identity, conversations, mandates, approvals, products, payment attempts, and Stripe MPP execution. The agent remains advisory. An agent response can request clarification or propose a mandate, but cannot create an authoritative mandate, approve one, or execute payment.

The browser must never receive the agent service token, OpenAI key, Supabase service-role key, payment credential, passkey private material, or biometric material.

## Proposed request sequence

1. The browser sends a message to the Next.js BFF with its passkey session and optional conversation ID.
2. The BFF forwards the request to a Node API chat endpoint.
3. The Node API verifies the passkey session and conversation ownership.
4. The Node API creates or resolves the conversation and persists the user message.
5. The Node API loads a bounded transcript and current product catalog.
6. The Node API calls the agent service with server-only authentication.
7. The agent treats transcript and catalog values as untrusted data and returns a strict structured response.
8. The Node API validates the response and persists the assistant message.
9. If the response proposes a mandate, the Node API creates its own immutable pending mandate ID after validating product, amount, currency, expiry, and ownership.
10. The BFF returns the authoritative result to the browser.

## Proposed secret placement

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

The Next.js deployment should no longer hold an agent token after this cutover.

## Cutover requirements

- Add an authenticated Node API chat endpoint.
- Move conversation persistence and agent invocation into one backend-controlled operation.
- Supply bounded conversation and product context from the Node API.
- Validate the agent Structured Output again at the Node API boundary.
- Persist authoritative mandate proposals in the Node API, never from an LLM-provided ID.
- Update the Next.js BFF to call only the Node API.
- Remove `AGENT_SERVICE_URL` and `AGENT_SERVICE_TOKEN` from the frontend deployment.
- Add end-to-end tests proving the browser cannot reach the agent directly and that agent failures do not bypass backend authorization.
