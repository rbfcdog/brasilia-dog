# Demo feature roadmap

This document is the iteration backlog for the Vero buyer, merchant, agent, and payment demo. It distinguishes implemented surfaces from work that still needs authoritative backend or settlement support.

## Product story

```text
Merchant publishes an exact offer
-> Buyer searches with the shopping agent
-> Agent queries the authoritative catalog
-> Buyer approves category and budget constraints
-> Fresh passkey verification approves the mandate
-> Agent selects a qualifying offer
-> Node API authorizes the payment path and records evidence
```

A mandate authorizes a category and constraints, not a previously selected item. Browsing is read-only and does not approve a purchase.

## Demo features

| Priority | Feature | Demo moment | Status | Why it matters |
| --- | --- | --- | --- | --- |
| 1 | Merchant creates and publishes a product | Merchant signs in, creates a fixed-price product with structured metadata, then publishes it. | Implemented | Shows a controlled supply side instead of a static catalog. |
| 2 | Agent discovers a merchant product | Buyer asks for a product such as a 4K monitor under a budget and sees current catalog-backed records. | Implemented after indexed catalog migrations are active | Connects merchant inventory to buyer chat. |
| 3 | Search mandate instead of product approval | Buyer approves constraints such as `ultrawide monitor up to $300`; no item is approved in advance. | Implemented as a non-executable proposal and demo workflow | The central differentiated interaction. |
| 4 | Native passkey approval before execution | Buyer accepts a mandate and completes a fresh WebAuthn verification before execution continues. | Implemented | Establishes human control. A device may use biometrics, PIN, or another local verifier. |
| 5 | Merchant order and proof timeline | Merchant opens an order and sees status, amount, risk reasons, execution proof reference, and receipt state. | Implemented for recorded attempts | Makes the operational side credible. |
| 6 | Merchant catalog lifecycle | Show draft, then publish, then show that only published active offers can reach Agent search. | Implemented | Demonstrates the publication boundary. |
| 7 | Agent comparison card | Buyer compares exact product slugs and sees current price, merchant, category, and metadata. | Implemented | Shows bounded tool use and evidence-based comparison. |
| 8 | Refund operations | Merchant creates a refund case for a settled order, including a reason and optional partial amount. | Implemented at the application layer | Adds merchant operations credibility. Do not claim live settlement reconciliation. |
| 9 | Cross-device passkey enrollment | Enroll a second device using a short-lived account-bound QR flow. | Deferred | Useful later, but not part of the primary demo after first-account setup moved to login. |
| 10 | Fail-safe examples | Demonstrate a draft product excluded from search, an over-budget offer excluded from a mandate, and a rejected passkey verification blocking execution. | Partially implemented | Security behavior is more persuasive when visible. |

## Demo feature inventory

| Feature | Demo moment | Why it lands |
| --- | --- | --- |
| Merchant creates and publishes a product | Merchant publishes `USB-C 4K Monitor` with price and structured specs. | Proves a controlled supply side, rather than a static catalog. |
| Agent discovers a merchant product | Buyer asks for `Show 4K monitors below $400` and receives the published listing, price, and metadata. | Proves merchant catalog data reaches buyer chat. |
| Search mandate, not product approval | Buyer approves `Find a 4K monitor under $400`; the mandate authorizes constraints and the Agent chooses a qualifying offer later. | Demonstrates buyer control without preselecting a seller or SKU. |
| Native passkey approval before execution | The browser invokes the platform WebAuthn prompt before execution continues. | Demonstrates fresh human verification. A local PIN is a valid verifier too. |
| Merchant order and proof timeline | Merchant inspects product, amount, status, risk rationale, execution-proof reference, and receipt state. | Provides operational evidence for the transaction story. |
| Merchant catalog lifecycle | Demonstrate draft to published to Agent-visible, with drafts absent from results. | Makes publishing, rather than record creation, the visibility gate. |
| Agent comparison card | Compare exact product slugs and show price, merchant, category, structured metadata, and selected result. | Makes bounded tool use visible. |
| Refund operations view | Open a settled order and create a refund case with reason and optional partial amount. | Adds operational credibility without representing incomplete reconciliation as live settlement. |
| Cross-device passkey enrollment | Enroll a second device through a short-lived QR code. | A strong security moment only after the live enrollment path is stable. |
| Fail-safe examples | Show a draft exclusion, over-budget exclusion, or rejected passkey verification blocking execution. | A visible denial is stronger than a generic security claim. |

## Recommended four-minute script

1. Merchant signs in and opens **Catalog**.
2. Merchant creates a structured fixed-price product as a draft.
3. Merchant publishes the product.
4. Buyer asks: `Buy an ultrawide monitor up to $300`.
5. Agent searches the authoritative catalog and returns qualifying product records.
6. Buyer reviews and approves a search mandate, not a SKU.
7. Browser requests fresh native passkey verification.
8. Agent selects a qualifying published offer within the approved constraints.
9. Merchant opens **Orders** to inspect the payment attempt and audit evidence.

## Required demo conditions

- Apply the product catalog and ranked search migrations to the target Supabase project.
- Activate the sandbox catalog using the exact `profile_test_...` Stripe profile.
- Use published products with active `stripe_mpp` offerings and enabled product endpoints.
- Configure the Node API, Agent service, and Next.js BFF with their distinct server-only service tokens.
- Use test mode only. Do not characterize mock execution or incomplete settlement as live money movement.

## Next iteration priorities

1. Show merchant provenance in buyer discovery: business name, publication status, fixed price, and exact qualifying metadata.
2. Make catalog-tool activity visible in chat so the demo shows the actual backend search request and returned result count.
3. Complete backend-authoritative mandate creation and approval resolution before presenting real settlement.
4. Add a deterministic demo fixture with one qualifying ultrawide monitor, one over-budget monitor, and one draft monitor.
5. Add merchant-facing receipt and refund-state transitions only after the Stripe reconciliation path is authoritative.
