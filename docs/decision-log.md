# NextWave Hackathon 2026 decision log

_The repository copy of the Mission Control flight log. Add an entry when the team makes a real trade-off._

---

## How to use this log

The jury reads this file. Record the decision while the reasoning is still clear. A useful entry names the choice, alternatives, reason, consequence, and the evidence that would make the team revisit it.

The pre-flight checklist requires at least three real trade-offs. Placeholder entries do not meet that requirement.

## Entry template

```markdown
## YYYY-MM-DD: Short decision title

**Decision:** What the team chose.

**Context:** The concrete constraint or problem that required a choice.

**Alternatives considered:**

- Option A and its trade-off
- Option B and its trade-off
- Option C and its trade-off

**Why this choice:** Facts, constraints, and expected behavior behind the decision.

**Consequence:** What becomes easier, harder, accepted, or explicitly out of scope.

**Revisit when:** The evidence or condition that would make this decision worth changing.
```

## Entries

## 2026-08-29: Custom LangGraph instead of `deepagents`

**Decision:** Build the purchasing agent as a small explicit LangGraph state machine and call the OpenAI Responses API directly for one structured offer-selection step.

**Context:** The agent must pause and resume for human approval, but the 24-hour hackathon rewards a working and defensible core over general autonomous-agent features. Authorization must remain deterministic in the backend.

**Alternatives considered:**

- `deepagents`, which provides planning, delegation, files, and broad tool use but adds capabilities and failure paths this closed purchase flow does not need.
- Plain sequential Node code, which is smaller but makes the human interrupt/checkpoint boundary and explicit transition diagram less faithful and inspectable.
- A custom LangGraph, which adds one framework dependency but models the finite workflow directly.

**Why this choice:** The required graph has named, testable steps and exactly one non-deterministic decision. LangGraph provides checkpointed interrupts and `Command(resume)` while allowing every authorization outcome to come only from the backend's discriminated response. Avoiding general planning, subagents, browsing, and arbitrary tools also narrows the prompt-injection surface.

**Consequence:** The flow is easy to audit and contract-test, but it is purpose-built for flights and does not dynamically invent plans or tools.

**Revisit when:** The product has multiple independently useful purchasing workflows whose shared planning/tool abstractions outweigh the additional attack surface and operational complexity.

## 2026-08-29: Remote signer instead of exporting the agent key

**Decision:** Keep the Ed25519 private key in the backend/KMS boundary and let the agent request a short-lived `agent-proof-v1` signature over an exact body hash, method, path, mandate version, nonce, and timestamps.

**Context:** The agent is explicitly untrusted and must hold no standalone spending power. The existing backend verifier already defines the compatible canonical Ed25519 proof format, while WebAuthn private material must remain in the user's authenticator.

**Alternatives considered:**

- Export an Ed25519 private key to the agent service, which removes one network call but turns compromise of the agent into key compromise and complicates rotation/audit.
- Use only the agent service bearer token, which authenticates a channel but does not bind a signed claim to exact purchase bytes for later evidence.
- Use a remote signer, which adds a backend round trip but preserves custody and creates a binding Layer A statement.

**Why this choice:** A remote signer makes the agent's rationale and offer claim tamper-evident without giving the model or agent process a private key. The backend still independently verifies current mandate state, replay nonce, price, and approval; a signature is evidence, not permission.

**Consequence:** Each presentation needs a signer call and depends on backend availability. In exchange, key custody, rotation, identity mapping, and audit stay in the authority boundary.

**Revisit when:** A hardware-backed workload identity can sign locally with equivalent non-exportability, rotation, policy enforcement, and audit evidence.

## 2026-08-29: In-memory checkpoints for the MVP

**Decision:** Use LangGraph `MemorySaver` and an in-process `RunStore` for the first functional version, with the limitation documented and surfaced operationally.

**Context:** The agent must be demonstrable and testable before the backend team has shipped the new REST routes. Adding durable Supabase/Postgres checkpoint and run schemas now would couple branches and expand the critical path.

**Alternatives considered:**

- Store checkpoints and runs directly in Supabase from the agent, which would violate the settled boundary that Node backend owns database authority and service-role access.
- Add new persistence routes to the backend immediately, which is the correct long-term boundary but is unavailable during this parallel MVP build.
- Keep state in memory, which is hermetic and fast but loses runs and interrupts on restart and cannot support multiple replicas.

**Why this choice:** In-memory state allows the entire allow, reject, escalation, revocation-during-wait, and resume flow to be tested today without inventing backend internals or sharing secrets. The service is deployed as one replica for the demo.

**Consequence:** Restarting the agent loses polling history and pending approvals; horizontal scaling is unsafe. This is an explicit MVP constraint, not a production durability claim.

**Revisit when:** The backend contract is available, before enabling multiple replicas, or before any environment where interrupted runs must survive a process restart. At that point both LangGraph checkpoints and public run metadata move behind backend-owned Postgres persistence.
