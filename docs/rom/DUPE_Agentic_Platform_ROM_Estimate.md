# DUPE Desarrollos Inmobiliarios — Agentic Business Platform ROM Estimate

Version: 0.1  
Date: 2026-06-14  
Status: Rough Order of Magnitude. Not a final implementation commitment.  
Prepared by: HCLTech AI Labs  

---

## Purpose

Provide a Rough Order of Magnitude for an **MVP Solution** — a fully operational Agentic Business Platform delivered to DUPE Desarrollos Inmobiliarios covering two integrated modules: Financial Management and Collections Management. Delivered under the HCLTech agentic delivery model.

---

## Agentic Solution Being Proposed

| Process Problem | Proposed Agentic Capability | How It Addresses The Problem |
|---|---|---|
| Manual bank reconciliation: officer assigns each transaction to a budget partida by hand | **Reconciliation Agent** with rule store | Auto-matches transactions to partidas; officer reviews only exceptions; learned rules improve match rate over time |
| Manual collections: officers track due dates in spreadsheets and send individual WhatsApp/email messages | **Collections Notification Agent** | Schedules and dispatches multi-channel notifications automatically per payment plan; captures delivery status |
| No financial alerting: management learns of budget overruns informally | **Financial Intelligence Agent** | Monitors partida execution vs. projected continuously; triggers traffic-light alerts on dashboard |
| Weekly management report is manually compiled from multiple spreadsheets | **Reporting Agent** | Compiles and dispatches weekly PDF report on schedule; generates financial statements on demand |
| No integrated system: all data lives in disconnected Excel workbooks | **Agentic Orchestrator + multi-tenant data platform** | Single platform connecting both modules; state machine ensures data flows between reconciliation, accounting, collections, and reporting |

The ROM covers the full agentic control layer: Orchestrator, Reconciliation Agent, Collections Notification Agent, Financial Intelligence Agent, and Reporting Agent. Bank statement files, WhatsApp Business API, and email delivery are orchestrated as external capabilities through controlled wrappers.

---

## Engagement Classification

**Classification: MVP Solution**

Rationale: DUPE requires real client data from day one, an operational system handed over for ongoing use, and role-based access for officers and management — these characteristics exceed any PoC tier and require a production-grade foundation per the HCLTech delivery ladder.

A **Gold PoC** (5-day sprint) may optionally precede the MVP to de-risk the WhatsApp notification and bank reconciliation flows with synthetic data before the full build clock starts.

---

## Implementation Boundary

| Area | ROM Position | MVP Treatment |
|---|---|---|
| **Agentic Orchestrator** | Build | Coordinates both modules; routes agent invocations; manages exception queues; owns audit trail |
| **Reconciliation Agent** | Build | AI-powered transaction-to-partida matching with confidence scoring; rule store learning |
| **Collections Notification Agent** | Build | Daily schedule scan; WhatsApp + email dispatch; delivery tracking; two-way message capture |
| **Financial Intelligence Agent** | Build | Budget vs. execution monitoring; traffic-light alerts; deficit forecasting |
| **Reporting Agent** | Build | Weekly PDF report; on-demand Balance General, Estado de Resultados, Flujo de Efectivo |
| **Bank Statement Parser** (deterministic tool) | Build as controlled tool | Parses CSV/TXT bank formats into structured transaction objects; no AI decision-making |
| **WhatsApp Business API** (Meta Cloud API) | Orchestrate / wrap | HCLTech builds wrapper; Meta provides the channel and approves templates |
| **Email service** (SendGrid) | Orchestrate / wrap | Email dispatch API; HCLTech configures templates and domain authentication |
| **PDF/Excel generation** (ReportLab / openpyxl) | Orchestrate / wrap | Library wrapper; no external SaaS dependency |
| **Financial data store** (PostgreSQL) | Build | Multi-tenant schema: projects, budgets, transactions, invoices, payment plans, clients |
| **Frontend dashboards** (React) | Build | Role-based views for officer and management; responsive (mobile-optimized for management) |
| **Human review — officer exception queue** | Orchestrate workflow state | Officers resolve unmatched reconciliation items; decisions feed rule store |
| **Human review — management approvals** | Orchestrate workflow state | Budget versions, payment plans, and escalation acknowledgements |

---

## ROM Summary

| Estimate View | Effort | Delivery Unit | Calendar Range | Notes |
|---|---:|---:|---|---|
| **Narrow path** (single project type, core notifications only) | 10–12 full pod days | 3-role agentic pod | ~5–6 elapsed weeks | Applies only if: scope limited to 1 project type, WhatsApp templates pre-approved, bank file format confirmed on Day 1 |
| **Recommended MVP Solution** | 14–18 full pod days | 3-role agentic pod | ~7–8 elapsed weeks | Includes both project types (social + tourist), full financial statements, rule store, officer + management dashboards, weekly reporting |
| **Contingency** (if triggered) | +3–5 full pod days | Same pod, targeted add-on | +1–2 elapsed weeks | Triggered by: multiple bank file format variations, delayed WhatsApp template approval requiring Twilio pivot, complex multi-project consolidation requirements |
| **Gold PoC** (optional pre-sprint) | 4–5 full pod days | 3-role agentic pod | 1 elapsed week | De-risks WhatsApp + reconciliation flows with synthetic data before MVP build clock starts; executive demo artefact |
| **Pilot Solution** | TBD — separate ROM | TBD | 3–6 months | Native mobile app, legal firm integration, real-time FX feed, full multi-project consolidation, BIM integration |

---

## Agentic Pod

| Pod Role | Delivery Focus | Primary Responsibility |
|---|---|---|
| **Context Architect** | Lead | Outcome framing, architecture direction, client decisions, assumption resolution, MVP acceptance criteria, commercial guardrails |
| **Value Engineer** | Core delivery | Agentic orchestration build, agent logic, module backends (finance + collections), API design, integration wrappers |
| **Quality Engineer** | Core quality | Reconciliation accuracy validation, notification deduplication checks, financial statement reconciliation, demo hardening, evidence capture |
| **DUPE Business SME** | Part-time client review | Validate bank statement parsing, confirm partida mapping, approve payment plan templates, review financial statement output |

---

## Commercial Anchor

| Commercial Item | Position |
|---|---|
| **Current baseline** | 14–18 full pod days, packaged as ~3–4 pod weeks over ~7–8 elapsed weeks, 3-role agentic pod |
| **Narrow path reference** | 10–12 full pod days over ~5–6 elapsed weeks — valid only if single project type, templates pre-approved, bank format confirmed |
| **Optional Gold PoC** | 4–5 full pod days, 1 elapsed week, delivered before MVP build clock starts |
| **Included** | Orchestrator + 4 specialist agents; Financial Management Module (budget, cash flow, reconciliation, accounting, tracking); Collections Module (payment plans, WhatsApp + email notifications, escalation, officer + management dashboards); weekly PDF report; role-based access; responsive web app; PostgreSQL schema; deployment documentation; handover |
| **Not included** | Native iOS/Android app; real-time FX rate feed; legal firm API integration; BIM / external PM tool integration; production infrastructure management (SRE); SOC 2 or formal security audit; multi-country tax compliance |
| **Change drivers** | Multiple bank file formats requiring separate parsers; WhatsApp template rejection requiring redesign; native mobile app requirement; multi-project consolidation beyond project-by-project view; second currency requiring real-time FX |
| **MVP-to-Pilot path** | MVP delivers the operational platform. Pilot expands to native mobile, legal firm notification API, real-time FX, BIM integration, and full multi-project consolidated reporting |

---

## Workstream Estimate

| Workstream | Planning Weight | Notes |
|---|---:|---|
| **Gravel track** — environment setup, database schema, CI/CD, deployment configuration | Medium | PostgreSQL, FastAPI, React app; Docker-based deployment; ~2 pod days |
| **Financial Management Module** — budget, partidas, cash flow, reconciliation, accounting | High | Core of financial module; reconciliation agent and rule store are the highest-complexity components; ~4–5 pod days |
| **Collections Management Module** — payment plans, notification agent, escalation logic, payment registration | High | WhatsApp template approval on critical path; two-way messaging adds complexity; ~4–5 pod days |
| **Dashboards and reporting** — officer queue, management portal, financial statements, weekly PDF | High | Multiple role-based views; PDF generation; mobile-optimized layout; ~3–4 pod days |
| **Integration wrappers** — bank parser, WhatsApp, email, PDF/Excel | Medium | Format variability is the risk; 2–3 bank formats expected; ~2–3 pod days |
| **Validation, testing, demo hardening** | High | Reconciliation accuracy test with real bank data; notification end-to-end test; SME review; ~2–3 pod days |
| **Recommended MVP baseline** | **14–18 full pod days** | Single total ROM estimate |
| **Narrow path reference** | **10–12 full pod days** | Only if scope explicitly limited as described above |

---

## ROM Drivers

**Factors that reduce effort:**
- DUPE has clear questionnaire answers for both modules — requirements are well-documented
- No ERP integration required; system built from scratch eliminates legacy complexity
- No late fees / mora logic simplifies collections calculations
- Management confirmed no native app required (responsive web only)
- Officer-only read access simplifies permission model

**Factors that increase effort:**
- No existing chart of accounts — HCLTech must define and get management sign-off before accounting module can be completed
- Bank statement format must be profiled for each bank (up to 3–4 DR banks); each variation adds parser work
- WhatsApp Business Account verification is on the critical path and controlled by Meta, not HCLTech
- Dual-currency (RD$ and USD$) adds complexity to reporting and financial statement generation
- Building from scratch (no existing data model, no existing codebase) means no reuse

---

## Key Assumptions

| Area | Assumption |
|---|---|
| **Bank statement format** | CSV or TXT format downloadable from DR bank netbanking (BHD, Banco Popular, Scotiabank or similar); sample file provided by DUPE in Week 1 |
| **WhatsApp templates** | DUPE initiates Meta WhatsApp Business Account verification and template submission in Week 1; MVP notification demo requires approved templates |
| **Email domain** | DUPE provides or creates a shared sending domain (e.g., cobros@dupedesa.com); HCLTech configures SendGrid authentication |
| **Chart of accounts** | HCLTech proposes a standard DR real estate chart of accounts; management approves in Week 1 before accounting module build begins |
| **Project type for MVP** | One project type (social interest residential, RD$) is the MVP scope; tourist project type (USD) added in Pilot unless client confirms Day 1 requirement |
| **Data for MVP** | DUPE provides: one project's existing budget/feasibility study Excel, 30 days of bank statements, list of active buyers with payment plan data |
| **Environment** | HCLTech provisions MVP cloud environment (VPS or managed cloud); DUPE IT confirms domain, email, and WhatsApp account setup |
| **Human review availability** | DUPE management and one collections officer are available for weekly review sessions (~2 hours/week) throughout MVP delivery |

---

## What Is Missing For MVP Certainty

| Missing / Unconfirmed Item | ROM Impact |
|---|---|
| Sample bank statement file (actual format) | Parser design cannot start without a real file; could add +1 pod days if format is non-standard |
| WhatsApp Business Account status | If account not yet registered, Meta verification adds 1–3 weeks to the calendar timeline (not pod days, but elapsed time) |
| Confirmation of project type scope (social only vs. both types in MVP) | Tourist project (USD) adds dual-currency complexity; if included in MVP, add +1–2 pod days |
| Chart of accounts approval from management | Accounting module build cannot complete until approved; targeted for Week 1 |
| Whether legal firm notification should be automated (API) or manual (dashboard flag only) | Automated legal notification adds +1 pod days for integration; manual flag is already included |
| Confirmation that physical construction progress is manual % entry (no PM tool integration) | If BIM or PM tool integration is required in MVP, this adds +2–3 pod days |

---

## Feasibility Recommendation

Proceed with MVP Solution. The problem is well-defined, the data sources are clear (bank files, Excel feasibility studies, buyer contracts), and the agentic automation points are high-value and low-risk (reconciliation and collections notifications are proven automation patterns). The main external dependency on the critical path is WhatsApp Business Account verification — this process should be initiated by DUPE on Day 1 of the engagement. The recommended first increment is to deliver a working reconciliation demo with a real bank statement file and a working notification dispatch using a test WhatsApp number, by the end of Week 2. This produces concrete evidence of the core agentic value before the full platform is built.
