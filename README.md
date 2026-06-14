# DUPE Desarrollos Inmobiliarios — Agentic Business Platform

**Client:** DUPE Desarrollos Inmobiliarios · Dominican Republic  
**Engagement:** MVP Solution — HCLTech AI Labs  
**Architect:** Jose Paulino, Senior AI Solution Architect  
**Date:** June 2026  
**Status:** Pre-build — L1 Architecture & ROM

---

## Overview

DUPE is a real estate developer in the Dominican Republic managing tourist and social interest residential projects (24–48 months, 100–480+ units) entirely through manual Excel workbooks. This platform replaces that with an integrated, agentic system of record covering financial management and collections.

**Two integrated modules, one agentic platform:**

- **Module 1 — Financial Management:** Budget tracking by project, cash flow projection vs. actual, daily bank reconciliation (Banco Popular CSV/TXT), accounting (invoices → journal entries → financial statements), and an executive dashboard with traffic-light KPI alerts.
- **Module 2 — Collections Management:** Auto-generated payment plans, automated WhatsApp + email notifications, delinquency escalation at Day +1/+6/+16, payment registration with auto-reconciliation, and officer + management portals.

---

## Architecture

### Agentic Layer

| Agent | Role |
|---|---|
| **Orchestrator** | Owns state machine for both modules; routes all agent invocations; manages exception queues and audit log |
| **Reconciliation Agent** | Parses bank statements; scores transaction-to-partida confidence; routes low-confidence items to officer queue; learns from decisions |
| **Collections Notification Agent** | Scans payment plans daily; dispatches WhatsApp + email per schedule; logs delivery status |
| **Financial Intelligence Agent** | Monitors budget vs. execution; calculates deviations; assigns traffic-light status per partida |
| **Escalation Router** | Triggers officer dashboard (Day +1), management notification (Day +6), legal flag (Day +16) |
| **Reporting Agent** | Compiles weekly PDF report and on-demand financial statements |

### Tech Stack

| Layer | Technology |
|---|---|
| Orchestration | LangGraph (state machine) |
| Backend | FastAPI + Python |
| Frontend | React (responsive web app) |
| Database | PostgreSQL (multi-tenant schema) |
| WhatsApp | Meta Cloud API (WhatsApp Business) |
| Email | SendGrid (`cobros@dupedesa.com`) |
| Bank input | Manual CSV/TXT upload — Banco Popular netbanking |
| PDF/Excel | ReportLab + openpyxl |

---

## Repository Structure

```
DUPE-Desarrollos-Inmobiliarios/
├── CLAUDE.md                          # AI agent standing instructions & project memory
├── README.md                          # This file
│
├── inputs/                            # Client-provided discovery materials
│   ├── Cuestionario_Requerimientos_DUPE REV.docx.pdf       # Finance questionnaire (answered)
│   ├── Cuestionario_Requerimientos_Cobros_DUPE REV.docx.pdf # Collections questionnaire (answered)
│   └── MODELOS FINANCIEROS DUPE - PROYECTOS TURISTICOS Y DE INTERES SOCIAL.xlsx
│
├── docs/
│   ├── architecture/
│   │   └── DUPE_Agentic_Platform_L1_Architecture.md        # Full L1 architecture (assumptions A1–A12)
│   ├── rom/
│   │   ├── DUPE_Agentic_Platform_ROM_Estimate.md           # ROM: 14–18 pod days, ~7–8 weeks
│   │   └── decks/
│   │       ├── build-dupe-deck.js                          # Deck build script (English, v1)
│   │       ├── build-dupe-deck-es.js                       # Deck build script (Spanish, dark theme)
│   │       ├── build-dupe-deck-light.js                    # Deck build script (Spanish, light theme) ← current
│   │       ├── package.json
│   │       └── client/
│   │           ├── DUPE_Agentic_Business_Platform_HCLTech_v1.pptx     # Light theme (current)
│   │           └── DUPE_Agentic_Business_Platform_HCLTech_v1_ES.pptx  # Dark theme
│   └── decisions/
│       └── 0001-engagement-classification.md               # ADR: why MVP Solution (not Gold PoC)
│
└── src/
    └── dupe_platform/
        ├── agents/                    # Agent stubs (LangGraph nodes)
        │   ├── orchestrator_agent.py
        │   ├── reconciliation_agent.py
        │   ├── collections_notification_agent.py
        │   ├── financial_intelligence_agent.py
        │   └── reporting_agent.py
        ├── modules/
        │   ├── finance/               # Budget, cash flow, reconciliation, accounting
        │   └── collections/           # Payment plans, notifications, portfolio
        ├── integrations/              # Bank parser, WhatsApp, email, PDF, Excel
        └── db/
            └── models.py              # PostgreSQL schema (multi-tenant)
```

---

## ROM Estimate

| | |
|---|---|
| **Classification** | MVP Solution (HCLTech delivery ladder) |
| **Pod Days** | 14–18 full pod days |
| **Elapsed Time** | ~7–8 weeks calendar |
| **Pod Composition** | 3-role agentic pod (Context Architect · Value Engineer · Quality Engineer) |
| **Contingency** | +3–5 pod days |
| **Optional Pre-sprint** | Gold PoC — 4–5 pod days to de-risk WhatsApp + reconciliation before MVP clock starts |

---

## Key Working Assumptions

| ID | Assumption |
|---|---|
| A1 | Bank statements are CSV/TXT manual download from Banco Popular netbanking — sample file needed Day 1 |
| A3 | Single WhatsApp Business number for all projects (HCLTech recommendation) |
| A5 | Email sent from shared domain (`cobros@dupedesa.com`) via SendGrid, not individual officer SMTP |
| A7 | HCLTech defines chart of accounts based on DR real estate standard; management approves Week 1 |
| A10 | Management mobile access = responsive web app, not native iOS/Android |

Full assumption table (A1–A12) is in `docs/architecture/DUPE_Agentic_Platform_L1_Architecture.md`.

---

## Open Critical Path Items

1. **WhatsApp Business Account** — DUPE must register with Meta immediately; verification takes 1–3 weeks
2. **Bank statement sample** — Banco Popular CSV/TXT format needed Day 1 to design the parser
3. **MVP scope** — social interest projects (RD$) only, or tourist projects (USD) too?
4. **Chart of accounts sign-off** — needed before accounting module build starts (Week 1)
5. **Cloud environment** — HCLTech-provisioned or DUPE's own account?
6. **Payment plan approval** — who approves before activation? (management / officer / automatic)
7. **Legal escalation at Day +16** — automatic dispatch to law firm or manual management action?

---

## Rebuilding the Client Deck

The PPTX is generated programmatically via `pptxgenjs` + `sharp`.

```bash
cd docs/rom/decks
npm install

# Light theme (Spanish) — current version
node build-dupe-deck-light.js

# Output: client/DUPE_Agentic_Business_Platform_HCLTech_v1.pptx
```

> **Note:** On first run the script generates `title_bg_light.png` automatically. If it fails, run the inline one-liner in the script header and retry.

---

## Contact

**Jose Paulino**  
Senior AI Solution Architect, HCLTech AI Labs  
jose.paulino@hcltech.com

---

*HCLTech · Supercharging Progress™ · © 2026 HCLTech. Confidential.*
