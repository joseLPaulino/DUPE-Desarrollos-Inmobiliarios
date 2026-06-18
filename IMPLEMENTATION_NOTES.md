# DUPE Agentic Platform — Implementation Notes

> **Status:** MVP POC scaffold · June 2026  
> All `[A-XXX]` tags are searchable across the codebase via `grep -r "A-XXX" src/`

---

## Blocked Integrations — Day 1 Checklist

| Tag | What's blocked | Synthetic stand-in | What to replace on Day 1 |
|-----|---------------|-------------------|--------------------------|
| `[A-BANK]` | Banco Popular CSV/TXT format unknown | `SyntheticBankStatementParser` generates 10 fake transactions from keyword list | Get sample statement → update column map in `domain/models/transaction.py` `from_csv_row()` |
| `[A-WA]` | Meta WhatsApp Business Account not verified (1–3 weeks) | `SyntheticMessagingAdapter` logs `[SYNTHETIC WA]` + fake `provider_id` | Replace `SyntheticMessagingAdapter` with `MetaWhatsAppAdapter`; set `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` in `.env` |
| `[A-EMAIL]` | SendGrid API key not provisioned | `SyntheticMessagingAdapter` also handles email path (logs `[SYNTHETIC EMAIL]`) | Add `SendGridAdapter`; set `SENDGRID_API_KEY` + `EMAIL_FROM` in `.env` |
| `[A-COA]` | Chart of accounts not signed off by management | 9 synthetic partidas (INGRESO-001..003, GASTO-001..006) | Swap partida codes/names after Week 1 sign-off; re-seed via `seed_synthetic_data()` |
| `[A-APPROVAL]` | Payment plan auto-activation flow TBD | Plans seed with `is_active=False`; PATCH `/payment-plans/{id}/approve` is wired | Set `PAYMENT_PLAN_AUTO_ACTIVATE=true` in `.env` to bypass manual approval, or keep `false` for management review flow |
| `[A-FX]` | USD/DOP exchange rate not yet defined | No FX conversion implemented | Add `FX_RATE_USD_DOP` to Settings; apply in budget partidas for tourist projects |
| `[A-TOURIST]` | Tourist project type (USD) not in MVP scope | `ProjectType.TOURIST` enum defined but no USD logic | Implement USD budget track after social interest MVP is stable |

---

## How to Run Locally (Without Docker)

```bash
# 1. Backend
cd /path/to/dupe
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: set DATABASE_URL to a local Postgres instance
uvicorn dupe_platform.adapters.inbound.api.main:app --reload --port 8000

# 2. Frontend
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

## How to Run with Docker Compose

```bash
docker compose up --build
# Backend:  http://localhost:8000
# Frontend: http://localhost:5173
# API docs: http://localhost:8000/docs
```

---

## Architecture — Ports & Adapters Quick Reference

```
domain/models/          ← Pure Python dataclasses, no framework deps
domain/ports/           ← Abstract interfaces (ABC)
  repositories.py       ← ProjectRepository, ClientRepository, ...
  services.py           ← MessagingPort, BankStatementParserPort, ReportGeneratorPort

application/use_cases/  ← Business logic only — calls ports, never adapters directly
  collections/          ← CreatePaymentPlanUseCase, SendNotificationsUseCase
  finance/              ← ReconcileTransactionsUseCase, GetDashboardUseCase

adapters/inbound/api/   ← FastAPI routers (HTTP → use cases)
adapters/outbound/
  persistence/          ← SQLAlchemy implementations of repositories  [TODO: stubs]
  messaging/            ← SyntheticMessagingAdapter  [A-WA, A-EMAIL]
  banking/              ← SyntheticBankStatementParser  [A-BANK]
```

---

## Repository Stubs — TODO

The following files are placeholder stubs (`# TODO: implement SQLAlchemy repository`).
Each one implements the corresponding ABC from `domain/ports/repositories.py`:

- `adapters/outbound/persistence/repositories/project_repo.py`  → `ProjectRepository`
- `adapters/outbound/persistence/repositories/client_repo.py`   → `ClientRepository`
- `adapters/outbound/persistence/repositories/plan_repo.py`     → `PaymentPlanRepository`
- `adapters/outbound/persistence/repositories/transaction_repo.py` → `TransactionRepository`
- `adapters/outbound/persistence/repositories/budget_repo.py`   → `BudgetRepository`
- `adapters/outbound/persistence/repositories/notification_repo.py` → `NotificationRepository`

Implement in this order: `project_repo` → `budget_repo` → `plan_repo` → `notification_repo`
(dashboard and collections are the most demo-critical paths).

---

## Critical Path — Items DUPE Must Action

1. **WhatsApp Business Account** — Register with Meta NOW. Verification takes 1–3 weeks.  
   Contact: `cobros@dupedesa.com` account owner.
2. **Bank statement sample** — Export one real CSV/TXT from Banco Popular netbanking.  
   Needed: Day 1 of build sprint.
3. **Chart of accounts sign-off** — Review the 9 synthetic partidas in `infrastructure/seed.py`.  
   Approve or modify at kickoff meeting (Week 1, Day 1).
4. **Project type scope** — Confirm: social interest only in MVP, or tourist (USD) too?
5. **Cloud environment** — HCLTech-provisioned or DUPE GCP/AWS account?

---

## Key Business Rules Implemented

- **Budget guard:** Partida execution > 110% → `over_110_guard()` raises `BudgetGuardError`. Override requires `management_override=True` flag.
- **Notification deduplication:** `NotificationRepository.already_sent(plan_id, trigger)` checked before every dispatch. Never send the same trigger twice for the same plan.
- **Escalation thresholds:** Day +1 → `OFFICER`, Day +6 → `MANAGEMENT`, Day +16 → `LEGAL`. Updated by `update_overdue_status()` on each installment.
- **Reconciliation confidence:** ≥ 0.85 → `HIGH`, ≥ 0.55 → `MEDIUM`, < 0.55 → `LOW`. Rules from `SYNTHETIC_RULE_STORE` in `reconcile_transactions.py`.
- **Audit logging:** All agent decisions must be logged with timestamp + confidence score. (Wired to `settings.DEBUG` print for now; replace with structured logging in prod.)
