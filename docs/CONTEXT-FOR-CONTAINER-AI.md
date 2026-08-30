# CONTEXT — read fully before touching code. Written 2026-08-30 01:40 São Paulo time.

## The clock

**Code freeze: 2026-08-30, 12:30 São Paulo time. ~11 hours from now.**
After that: local pitches (13:00–15:00), city champion announced (15:30), global finale (16:30).

Required at freeze: public GitHub repo with a README a stranger can follow · slides link (no login) · demo (video or live) · **architecture diagram, PDF or PNG, ≤25MB** · decision log with ≥3 real trade-offs (**already done — see below**).

## What this is

NextWave Hackathon 2026 (Yuno + Nauta, São Paulo site). Challenge 01: **"The Buyer Who Isn't Human."** Full brief: `docs/challenge-01-buyer-who-isnt-human.md`.

## How the jury actually scores — read this before prioritizing anything

Five lenses, in weight order:
1. **Does it work?** Runs end to end, survives a judge changing something live with zero team help.
2. **Depth and judgment** — sound architecture, decisions explained, trade-offs in the decision log.
3. **Solves the real problem, ugly cases included** — not a nearby generic product.
4. **Originality** — a distinct mechanism, not the obvious permission-checker.
5. **Experience and clarity** — usable, legible demo, readable repo.

Explicitly does **not** score: number of features, integrations, or lines of code. A polished frontend for a system that doesn't run live scores *worse* than a rough one that does.

**The trial by fire is the single highest-leverage moment.** Judges will revoke a mandate live, or change a limit, and watch the system react — without the team touching anything. Everything else is secondary to this working, visibly, in front of them.

## The product thesis (do not relitigate — this is settled)

Most teams will build a permission checker: amount, category, expiry. That is table stakes, worth almost nothing on its own.

> **The mandate is not a gate. It is proof.**
> The blocked-purchase case harms nobody — no money moves. The **dispute** case, months later, is where money actually moves and where today's payment infrastructure has nothing. The product is making agent authorization **provable after the fact**, not just enforced in the moment.

Three architectural commitments, already reflected in the code:
- **The agent is external, untrusted, hostile by default.** It never holds spending power — see the "Remote signer instead of exporting the agent key" decision below. It carries a signed *claim*, never a credential.
- **AI never decides yes/no on money.** The LangGraph agent proposes; the backend's deterministic verifier decides. Ambiguous semantic cases can only ever *request escalation*, never self-approve — see the "Custom LangGraph instead of `deepagents`" decision.
- **Tracing is the product, not instrumentation.** `agent_execution_proofs` + `audit_events` are the compelling-evidence package a merchant would submit against a chargeback — this is Layer A (agent's signed claim) vs Layer B (what the backend independently observed), cross-checked.

Positioning line for the pitch: *"Yuno's Vault protects the card. We protect the intent."*

## Verified current state (confirmed today, not stale)

**Tests: 174 passing, 0 failing.** api 99/99 · agent 36/37 (1 skipped, requires `LIVE_OPENAI=1`, not a real failure) · front 39/39.

**Decision log has 3 real entries** (`docs/decision-log.md`), meeting the ≥3 checklist requirement:
- Custom LangGraph instead of `deepagents`
- Remote signer instead of exporting the agent key (Ed25519 proof stays backend/KMS-custodied; agent gets a short-lived signed `agent-proof-v1`, never a private key)
- In-memory checkpoints for the MVP (LangGraph `MemorySaver`, explicit single-replica limitation, documented restart/scaling risk)

These are genuinely good — specific, honest about trade-offs, name a revisit condition. Do not weaken them. Add more in the same style as you make further real trade-offs before freeze.

**Confirmed implemented, backend + agent:**
- `POST /v1/mandates/{id}/revoke` → `mandateRepository.revoke()` → agent's `graph.ts` checks `mandate.status === 'revoked'` and returns `MANDATE_REVOKED`. **This is the trial-by-fire mechanic and it exists.**
- Escalation: `escalation_required` outcome, `semanticEscalationRequested` flag, LangGraph checkpointed interrupt + `Command(resume)`. The agent correctly refuses to silently approve out-of-mandate purchases.
- Agent identity + signed proofs: Ed25519, remote signer, nonce replay protection, canonical payload binding method/path/body-hash/mandate-version.
- Full merchant platform: dashboard, catalog, orders, finance projections, refund cases, RLS-scoped Supabase Auth (`docs/merchant-platform.md`).
- Passkey (WebAuthn) buyer auth, conversation persistence, ranked marketplace search.
- Local dev container (`.devcontainer/`), all three services (api:3000, agent:3001, front:3002) verified booting clean today.

## Gaps — verify each of these against the live tree first, then close in this order

I found these by grepping the current tree; I did not read every file, so **confirm before you act, especially #1**.

### 1. 🔴 No frontend surface found for the escalation round-trip — verify and close first
`MandateCard`'s `onApprove` is for approving the *initial* mandate before any purchase runs. I found **no match** for escalation/out-of-mandate/approve-or-deny language in `chat-experience.tsx` or `biometric-dialog.tsx` for the *mid-purchase* moment — when the agent hits a limit and the backend returns `escalation_required`, is there any screen where a human sees "your agent wants $X, your limit is $Y" and can approve-once / raise-limit / deny, with the answer flowing back to resume the agent?

**This is the literal trial-by-fire moment.** The backend and agent logic for it exists and is tested; if there is truly no UI for it, a judge changing a limit live has nothing to watch happen except an API response. Confirm first — search harder than my grep did, including anything under `(buyer)/assistant` — then build the missing piece if it's real. This is worth more than anything else on this list.

### 2. 🟡 Trial-by-fire rehearsal — not a code task, a process task
Has anyone actually played judge: revoke a mandate mid-flow through the real UI, or change a limit, and watched the system react with zero team intervention? Do this today, more than once, before freeze. If it's flaky, that flakiness is worth more engineering time than any new feature.

### 3. 🟡 Architecture diagram artifact does not appear to exist yet
`agent/docs/api-gateway-chat-architecture.md` is a markdown note, not the required submission artifact — Mission Control requires **PDF or PNG, ≤25MB**. This is a hard deliverable and a scored lens ("depth and judgment" reads it directly). Build it late enough to reflect final architecture, but don't leave it to the last hour.

### 4. 🟢 Adversarial agent — bonus, zero evidence found
No hits for "adversarial" anywhere in the tree. Bonus: *"defense against an adversarial agent trying to buy outside its mandate through creative paths."* Highest-differentiation bonus per the brief (near nobody else will build this) but genuinely optional — only attempt after #1 and #2 are solid. If time allows: split one purchase into several under-limit ones (structuring), replay an old signed proof, or push the semantic-category boundary.

### 5. 🟢 Dispute resolution flow — bonus, distinct from refund cases
`refund-service.ts` / merchant refund cases exist, but that's a different mechanic from Challenge 01's bonus: *"a complete dispute flow: the human denies a purchase and the auditable trail resolves who is right."* No evidence of that specific flow (buyer disputes → trail cross-checked → verdict). Optional, but if built, it directly demonstrates the core thesis ("the mandate is proof, not a gate") better than anything else on this list — consider it before the adversarial agent if you have to choose.

### 6. 🟡 Possible scope risk, needs a team judgment call, not mine to decide
The merchant platform (dashboard, catalog, orders, finance) is substantial surface. The jury explicitly does not score feature count, and a judge's 10-minute slot will center on the trial by fire, not the merchant admin panel. Worth a five-minute team gut-check: is remaining time still going toward #1 and #2, or toward polish that won't be seen? Not a call I'm making for you — flagging it because the evaluation guidelines are explicit that this is exactly the wrong place to spend hour 20 of 24.

## What I want from you

1. Verify gap #1 for real — search the actual current tree, don't trust my grep. Report back what you find before writing anything.
2. Confirm #4 and #5 are really absent (quick greps are enough).
3. Then propose a prioritized plan for the remaining ~11 hours, ordered by the jury lenses above, and hand it back before executing — this is a shared decision with the rest of the team, not a solo call.
