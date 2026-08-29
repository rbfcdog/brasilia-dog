# NextWave Hackathon 2026

_Reference material for the Yuno × Nauta hackathon brief, judging criteria, and submission readiness._

---

## Navigation

| Document | Purpose |
| --- | --- |
| [Hackathon overview](./hackathon-overview.md) | Event rules, timing, and operating constraints |
| [Tracks](./tracks.md) | Side-by-side map of the four selectable challenges |
| [Track selection guide](./track-selection-guide.md) | Adversarial team-fit analysis, including why Challenges 01 and 03 can beat a higher-spectacle Track 04 |
| [Yuno and Nauta context](./yuno-nauta-context.md) | Company domains, reported event partnership, track classification, evidence limits, and sources |
| [Challenge 01: The Buyer Who Isn't Human](./challenge-01-buyer-who-isnt-human.md) | Agent purchase mandates and merchant verification |
| [Track 01 product direction](../api/docs/track-01-product-direction.md) | Team proposal for a governed agent marketplace, authorization, payment research, risks, and build order |
| [Stripe MPP production runbook](../api/docs/stripe-mpp-production-runbook.md) | Stripe account readiness, MPP validation stages, payment boundaries, and live-funds controls |
| [Challenge 02: The Control Tower](./challenge-02-control-tower.md) | Payment conversion monitoring and root-cause diagnosis |
| [Challenge 03: The Interface That Builds Itself](./challenge-03-interface-that-builds-itself.md) | Runtime-generated workflow UI |
| [Challenge 04: The Agent on the Line](./challenge-04-agent-on-the-line.md) | Voice logistics negotiation and commitments |
| [Evaluation guidelines](./evaluation-guidelines.md) | Jury lenses, judging format, and scoring principles |
| [Deliverables](./deliverables.md) | Required submission artifacts and their acceptance criteria |
| [Mission control](./mission-control.md) | Payload fields, flight log, and pre-flight checklist |
| [Decision log](./decision-log.md) | Flight-log template for real technical trade-offs |

## Source boundary

These files reorganize the NextWave Hackathon 2026 material supplied for this repository. They record the brief and readiness requirements. The track selection guide contains a team-facing recommendation, not an official track assignment or a claim that a product has been built. The Track 01 product direction records a current team proposal and evidence boundaries, not final registration or a live integration. The Stripe MPP production runbook is a future production-readiness plan, not a live-provider approval or authorization to process external marketplace purchases.

## Documentation map

```mermaid
flowchart TD
    accTitle: NextWave hackathon documentation map
    accDescr: The repository records event rules, challenge specifications, selection guidance, judging criteria, and submission requirements.

    overview["Event overview"] --> tracks["Track comparison"]
    tracks --> c01["Challenge 01: agent purchase"]
    c01 --> direction["Track 01 product direction"]
    direction --> stripe["Stripe MPP production runbook"]
    tracks --> c02["Challenge 02: payment control tower"]
    tracks --> c03["Challenge 03: runtime UI"]
    tracks --> c04["Challenge 04: voice logistics"]
    tracks --> selection["Track selection guide"]
    overview --> evaluation["Evaluation guidelines"]
    overview --> deliverables["Deliverables"]
    deliverables --> mission["Mission control: payload, flight log, pre-flight"]

    classDef core fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#1e3a5f
    classDef track fill:#fef9c3,stroke:#ca8a04,stroke-width:2px,color:#713f12
    classDef submission fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d

    class overview,tracks,selection,direction core
    class c01,c02,c03,c04 track
    class evaluation,deliverables,mission submission
```
