# ADR-0001: Engagement Classification — MVP Solution

**Date:** 2026-06-14  
**Status:** Accepted  
**Author:** Jose Paulino, HCLTech AI Labs

## Decision

This engagement is classified as an **MVP Solution** on the HCLTech delivery ladder.

## Rationale

The classification rules from the HCLTech delivery model were applied as follows:

| Rule | Assessment |
|---|---|
| Does it require production/integration environment? | **Yes** — DUPE has no sandbox; the platform IS the system of record from go-live |
| Is output expected to be durable, maintainable, handed over? | **Yes** — DUPE will operate this platform ongoing; it replaces their Excel workflows |
| Is real client data used from day one? | **Yes** — real bank statements, real buyer contracts, real payment plans |
| Multi-sprint? | **No** — fixed scope; single delivery; Pilot is a separate conversation |

→ At least **MVP Solution** is required. Gold PoC is classified as an **optional pre-sprint** (4–5 pod days) to de-risk the WhatsApp notification and reconciliation flows with synthetic data before the full MVP clock starts.

## Alternatives Considered

- **Gold PoC only:** Rejected. DUPE requires an operational system — a 5-day demo does not satisfy the engagement. A PoC would leave the client without a working solution.
- **Pilot Solution:** Premature. Pilot scope (native mobile, legal firm API, real-time FX, BIM) is not required in the initial engagement. Pilot is the natural evolution after MVP is accepted.

## Consequences

- ROM is expressed as 14–18 full pod days, ~7–8 elapsed weeks
- Gravel track setup (environment, DB, CI/CD) is included in scope
- Handover documentation and operational runbook are included
- All code is written for long-term maintainability, not disposable demo code
