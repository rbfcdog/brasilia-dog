# NextWave Hackathon 2026 tracks

_A comparison of the four selectable challenges. A crew must select one, and the choice is final._

---

## Track comparison

| # | Challenge | Core problem | Required live proof | Trial by fire |
| --- | --- | --- | --- | --- |
| 01 | [The Buyer Who Isn't Human](./challenge-01-buyer-who-isnt-human.md) | Safely authorize and verify purchases by an AI agent without exposing a raw card | Mandate creation, merchant verification, purchase, audit record, and failure paths | Judge revokes or changes a mandate, then starts another purchase |
| 02 | [The Control Tower](./challenge-02-control-tower.md) | Detect and explain meaningful payment-conversion drops in a transaction stream | Noise avoidance, detection, root cause, cost, recommendation, and prioritization | Judge injects a new combination of dimensions |
| 03 | [The Interface That Builds Itself](./challenge-03-interface-that-builds-itself.md) | Generate a live, bidirectional workflow UI from an agent’s changing run state | Runtime UI creation, live restructuring, human response, and agent course change | Judge changes a flow and expects the interface to adapt without frontend work |
| 04 | [The Agent on the Line](./challenge-04-agent-on-the-line.md) | Run a legacy drayage process through real phone calls and auditable commitments | Real outbound and inbound calls, negotiation, recap, commitments, and escalation | Judge improvises as an uncooperative dispatcher in a live call |

## Company context

The track domains align as follows:

- Yuno: Challenge 01 and Challenge 02
- Nauta: Challenge 03 and Challenge 04

This is a domain-based classification from the public company material, not verified authorship of the individual briefs. [Yuno and Nauta company context](./yuno-nauta-context.md) records the supporting sources and the limit of this claim.

## Common bar

All tracks require a prototype that judges can operate without help from the team. Teams may invent the data and system around the chosen brief. The required live behavior, ugly cases, and audit trail still need to work.

## Track summaries

### Challenge 01: Agent purchases

A merchant accepts an AI purchasing agent only after validating a human-issued spending mandate. The system must address authorization, verification, revocation, disputes, and auditability.

### Challenge 02: Payment operations

A payment orchestrator processes transactions across merchants, providers, payment methods, countries, issuing banks, and decline codes. The system must detect a meaningful conversion drop and show the evidence behind a root-cause diagnosis.

### Challenge 03: Runtime interfaces

A logistics agent creates its UI from the state of a workflow run rather than using fixed screens. A human action in the UI must change the agent’s next action in that same run.

### Challenge 04: Voice logistics

A logistics voice agent negotiates trucking on real telephone calls within a mandate. The system must create structured commitments, stay in sync with operational data, and support escalation during a call.

## Full specifications

- [Challenge 01](./challenge-01-buyer-who-isnt-human.md)
- [Challenge 02](./challenge-02-control-tower.md)
- [Challenge 03](./challenge-03-interface-that-builds-itself.md)
- [Challenge 04](./challenge-04-agent-on-the-line.md)
