# DUPE Agentic Business Platform — AI Agent Context

## Project Identity

**Client:** DUPE Desarrollos Inmobiliarios  
**Engagement:** MVP Solution — HCLTech AI Labs  
**Prepared by:** Jose Paulino, Senior AI Solution Architect  
**Date:** June 2026  
**Classification:** MVP Solution (HCLTech delivery ladder)  
**Phase:** L1 Architecture & ROM — Pre-build

---

## Problem Statement

DUPE is a real estate developer in the Dominican Republic managing tourist and social interest residential projects (24–48 months, 100–480+ units) entirely through manual Excel workbooks. No integrated financial system exists. Collections are managed by individual officers sending WhatsApp and email messages manually. Management has no real-time visibility into project health.

---

## What We Are Building

Two integrated modules under one agentic platform:

### Module 1: Financial Management
- Budget management by project (income partidas: 5–8; expense partidas: 7 with 28–35 sub-partidas)
- Cash flow projection vs. actual (24–48 month horizon)
- Daily bank reconciliation via manual CSV/TXT upload from netbanking
- Accounting: invoice entry → auto journal entries → Balance General, Estado de Resultados, Flujo de Efectivo
- Executive dashboard: KPIs, traffic-light alerts, budget vs. executed, drill-down

### Module 2: Collections Management
- Auto-generate payment plans (8–16 installments) from sale date + delivery date
- Automated WhatsApp + email notifications: 5 days pre-due, day-of, and overdue
- Delinquency escalation: officer dashboard (Day +1), management notification (Day +6), legal flag (Day +16)
- Payment registration, auto-reconciliation to installment, receipt generation
- Officer dashboard (read-only) + management portal (full access, mobile-optimized)

### Agentic Layer
| Agent | Role |
|---|---|
| Orchestrator | Owns state machine for both modules; routes all agent invocations |
| Reconciliation Agent | Auto-matches bank transactions to partidas; builds rule store from officer decisions |
| Collections Notification Agent | Dispatches WhatsApp + email per payment plan schedule |
| Financial Intelligence Agent | Monitors budget vs. execution; triggers traffic-light alerts |
| Escalation Router | Triggers overdue escalation at Day +1, +6, +16 |
| Reporting Agent | Compiles weekly PDF report and on-demand financial statements |

---

## Key Constraints

- **No existing systems** — building from scratch
- **No ERP or CRM** — platform IS the system of record
- **Bank format** — manual CSV/TXT download from DR bank netbanking; format sample needed Day 1
- **WhatsApp** — Meta Cloud API; Business Account verification on critical path; must start immediately
- **Email** — shared domain mailbox (cobros@dupedesa.com) via SendGrid; not individual officer SMTP
- **Currencies** — RD$ (social projects) and USD (tourist projects); manual FX rate set by management
- **Chart of accounts** — HCLTech proposes DR real estate standard; management approves Week 1
- **Mobile** — responsive web app (not native app); management-only mobile view

---

## Agentic Pod

| Role | Responsibility |
|---|---|
| Context Architect | Outcome, architecture, client decisions, assumption resolution, MVP acceptance |
| Value Engineer | Agent logic, module backends, API, integration wrappers |
| Quality Engineer | Reconciliation accuracy, notification deduplication, financial statement validation, demo hardening |
| DUPE Business SME (client) | Bank statement format, partida mapping approval, payment plan review |

---

## Delivery Classification

**MVP Solution** — 14–18 full pod days, ~7–8 elapsed weeks, 3-role agentic pod  
Optional Gold PoC: 4–5 pod days (1 week) to de-risk WhatsApp + reconciliation before full MVP clock

---

## Key Deliverables Location

| Deliverable | Path |
|---|---|
| L1 Architecture | `docs/architecture/DUPE_Agentic_Platform_L1_Architecture.md` |
| ROM Estimate | `docs/rom/DUPE_Agentic_Platform_ROM_Estimate.md` |
| Client Deck | `docs/rom/decks/client/DUPE_Agentic_Business_Platform_HCLTech_v1.pptx` |
| Discovery Questionnaires | `inputs/` |
| Financial Model (Excel) | `inputs/MODELOS FINANCIEROS DUPE...xlsx` |

---

## Confirmed Working Assumptions (from questionnaires)

See full assumption table in the L1 Architecture document. Key ones:

- **A1** Bank statements are CSV/TXT manual download — sample file needed Day 1
- **A3** Single WhatsApp Business number for all projects (HCLTech recommendation accepted)
- **A5** Email from shared domain, not individual officer inboxes
- **A7** HCLTech defines chart of accounts (no existing plan)
- **A10** Management mobile = responsive web app, not native app

---

## Open Critical Path Items

1. **WhatsApp Business Account** — DUPE must register with Meta immediately; verification takes 1–3 weeks
2. **Bank statement sample** — needed Day 1 to start parser design
3. **Project type scope** — social interest only in MVP, or tourist (USD) too?
4. **Chart of accounts sign-off** — needed before accounting module build starts (Week 1)
5. **Cloud environment** — HCLTech-provisioned or DUPE account?

---

## Standing Instructions for AI Agent

- Always refer to the L1 Architecture document before making module design decisions
- All reconciliation rule decisions by officers must be persisted to the rule store
- Notification deduplication is mandatory — check schedule store before every dispatch
- Financial statements must balance; include a reconciliation check in the Reporting Agent
- Budget guard must prevent partida execution > 110% without explicit management override
- All agent decisions must be logged to the audit store with timestamp and confidence score
- Assumptions A1–A12 are working assumptions; flag any code that depends on them
