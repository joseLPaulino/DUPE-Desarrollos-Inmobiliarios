"""
Synthetic data seeder — REAL DUPE data from client Excel model.

Source: MODELOS FINANCIEROS DUPE - PROYECTOS TURISTICOS Y DE INTERES SOCIAL.xlsx

Social: "Residencial Don Memendo — PNFF (Etapa I y II)"
  Fase 1 & 2: 100 units each, 3 hab, 60.83m², RD$3,460,000/unit
  Fase 3 & 4: 140 units each, 3 hab, 60.83m², RD$3,460,000/unit
  Total: 480 units, RD$1,660,800,000

Tourist: "Juan Dolio — Turístico"
  Fase 1: 45 units, 3 hab, 110m², $330,000 USD/unit, Total $14,850,000 USD
  Total gastos: $10,561,406 USD

Budget partida amounts taken directly from Excel feasibility study.
Idempotent: skips if data already exists.
"""
from __future__ import annotations
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.outbound.persistence.models import (
    ProjectORM, UnitORM, ClientORM, PaymentPlanORM, InstallmentORM,
    BudgetORM, PartidaORM, PartidaExecutionORM, NotificationORM,
    CashFlowMonthlyORM, InvoiceORM, OfficerGoalORM,
    LeadORM, GestionCaseORM, PostventaCaseORM, CalendarEventORM,
)

logger = logging.getLogger("dupe.seed")

# ── Projects — exact names and numbers from DUPE Excel ────────────────────────
# EV INTERES SOCIAL: Residencial Don Memendo — PNFF (Etapa I y II)
#   Fase 1: 100 units, 60.83m², RD$3,460,000/unit = RD$346,000,000
#   Fase 3: 140 units, 60.83m², RD$3,460,000/unit = RD$484,400,000
# EV TURISTICOS: Juan Dolio — Turístico
#   Fase 1: 45 units, 110m², $330,000 USD = $14,850,000 USD
PROJECTS = [
    {
        "id": UUID("a1b2c3d4-0000-0000-0000-000000000001"),
        "name": "Residencial Don Memendo — PNFF Etapa I (Fase 1)",
        "project_type": "social_interest",
        "status": "construction",
        "start_date": date(2024, 9, 1),
        "expected_delivery_date": date(2027, 6, 30),
        "total_units": 100,
        "currency": "DOP",
        "total_budget": Decimal("346000000.00"),   # Excel: 100 units × RD$3,460,000 = RD$346M
        "physical_progress_pct": Decimal("38.5"),
        "notes": "3 habitaciones, 60.83m², RD$3,460,000/unidad. Precio/m²: RD$49,500. Santo Domingo.",
    },
    {
        "id": UUID("a1b2c3d4-0000-0000-0000-000000000002"),
        "name": "Residencial Don Memendo — PNFF Etapa II (Fase 3)",
        "project_type": "social_interest",
        "status": "planning",
        "start_date": date(2025, 6, 1),
        "expected_delivery_date": date(2028, 9, 30),
        "total_units": 140,
        "currency": "DOP",
        "total_budget": Decimal("484400000.00"),   # Excel: 140 units × RD$3,460,000 = RD$484.4M
        "physical_progress_pct": Decimal("8.0"),
        "notes": "3 habitaciones, 60.83m², RD$3,460,000/unidad. 140 unidades.",
    },
    {
        "id": UUID("a1b2c3d4-0000-0000-0000-000000000003"),
        "name": "Juan Dolio — Turístico Fase 1",
        "project_type": "tourist",
        "status": "construction",
        "start_date": date(2026, 6, 1),
        "expected_delivery_date": date(2028, 12, 31),
        "total_units": 45,
        "currency": "USD",
        "total_budget": Decimal("14850000.00"),    # Excel: 45 units × $330,000 USD = $14.85M
        "physical_progress_pct": Decimal("12.0"),
        "notes": "3 habitaciones, 110m², $330,000 USD/villa. Precio/m²: $3,000. Juan Dolio, SD.",
    },
]

# ── Budget partidas — direct from Excel feasibility study ─────────────────────
# Social: Fase 1 (100 units). Total gastos (480 units) = RD$1,324,722,699.
# Fase 1 ≈ 20.84% of total (100/480). Key line items allocated proportionally.
# Excel references: SUELO, CONSTRUCCION EDIFICACION, TECNICOS, JURIDICO,
#                   COSTES FINANCIEROS, GESTION INTEGRAL, COMERCIALIZACION
PARTIDAS_SOCIAL = [
    # Income partidas (per payment plan structure: Separación, Inicial, Entrega, FONVIVIENDA)
    {"code": "ING-001", "name": "Separaciones — Depósito Inicial",           "type": "income",  "budget": Decimal("10380000.00"),   "executed": Decimal("8304000.00")},   # 100 × ~103,800
    {"code": "ING-002", "name": "Cuotas Mensuales (Inicial 30%)",            "type": "income",  "budget": Decimal("103800000.00"),  "executed": Decimal("44680000.00")},
    {"code": "ING-003", "name": "Pago Entrega + Financiamiento Bancario",    "type": "income",  "budget": Decimal("207600000.00"),  "executed": Decimal("0.00")},
    {"code": "ING-004", "name": "Bono FONVIVIENDA (INVI)",                   "type": "income",  "budget": Decimal("24220000.00"),   "executed": Decimal("0.00")},
    # Expense partidas — amounts from Excel EV INTERES SOCIAL, Fase 1 share
    {"code": "GAS-001", "name": "Suelo y Transferencia",                     "type": "expense", "budget": Decimal("16470563.00"),   "executed": Decimal("16470563.00")},  # 100% — land cost paid
    {"code": "GAS-002", "name": "Construcción — Edificación Fase 1",        "type": "expense", "budget": Decimal("183706600.00"),  "executed": Decimal("70742000.00")},  # 38.5% progress
    {"code": "GAS-003", "name": "Técnicos (Arq, Top, Geotécnico, Ambiental)","type": "expense", "budget": Decimal("2329681.00"),    "executed": Decimal("2329681.00")},   # 100% — pre-construction
    {"code": "GAS-004", "name": "Honorarios — Gestión Integral (3%+ITBIS)", "type": "expense", "budget": Decimal("12258816.00"),   "executed": Decimal("13709233.00")},  # 112% → 🔴 RED
    {"code": "GAS-005", "name": "Jurídico (Asesoría, Condominio, ITBIS)",    "type": "expense", "budget": Decimal("7865085.00"),    "executed": Decimal("7076576.00")},   # 90% → 🟡 AMBER
    {"code": "GAS-006", "name": "Costes Financieros (Intereses 15%)",        "type": "expense", "budget": Decimal("19953373.00"),   "executed": Decimal("7182014.00")},
    {"code": "GAS-007", "name": "Comercialización (5%+ITBIS+Parque)",       "type": "expense", "budget": Decimal("21247017.00"),   "executed": Decimal("12748210.00")},
    {"code": "GAS-008", "name": "Imprevisto (2% construcción)",              "type": "expense", "budget": Decimal("3840000.00"),    "executed": Decimal("0.00")},
]

# Tourist: Juan Dolio Fase 1 (45 units). Amounts from EV TURISTICOS sheet.
# Excel total gastos = $10,561,406 USD
PARTIDAS_TOURIST = [
    # Income
    {"code": "ING-001", "name": "Separaciones — Depósito Inicial",           "type": "income",  "budget": Decimal("742500.00"),     "executed": Decimal("495000.00")},   # 15 units × $49,500
    {"code": "ING-002", "name": "Cuotas Mensuales (Inicial 20%)",            "type": "income",  "budget": Decimal("2970000.00"),    "executed": Decimal("594000.00")},
    {"code": "ING-003", "name": "Pago Entrega + Mortgage / Cash",            "type": "income",  "budget": Decimal("11137500.00"),   "executed": Decimal("0.00")},
    # Expense — from Excel EV TURISTICOS
    {"code": "GAS-001", "name": "Suelo — Terreno Comercial",                 "type": "expense", "budget": Decimal("1802500.00"),    "executed": Decimal("1802500.00")},  # 100% — paid
    {"code": "GAS-002", "name": "Construcción Villas (110m² × $1,300/m²)",  "type": "expense", "budget": Decimal("6499350.00"),    "executed": Decimal("779922.00")},   # 12% progress
    {"code": "GAS-003", "name": "Técnicos (Arq 2%, Topografía, Acometidas)","type": "expense", "budget": Decimal("313982.00"),     "executed": Decimal("313982.00")},   # 100% — pre-construction
    {"code": "GAS-004", "name": "Jurídico (Condominio, Régimen)",            "type": "expense", "budget": Decimal("90991.00"),      "executed": Decimal("90991.00")},    # 100% → 🔴 (full budget)
    {"code": "GAS-005", "name": "Costes Financieros (Intereses 20%)",        "type": "expense", "budget": Decimal("603204.00"),     "executed": Decimal("542884.00")},   # 90% → 🟡 AMBER
    {"code": "GAS-006", "name": "Comercialización (6%+ITBIS+Parque Ventas)","type": "expense", "budget": Decimal("1251380.00"),    "executed": Decimal("500552.00")},
]

# ── Clients — Dominican names with real cédula format ─────────────────────────
CLIENTS = [
    {"id": UUID("c0000000-0000-0000-0000-000000000001"), "first_name": "María Elena",  "last_name": "Rodríguez Pichardo", "cedula": "001-1234567-8", "phone": "+18091234001", "email": "m.rodriguez@gmail.com",       "nationality": "Dominicana"},
    {"id": UUID("c0000000-0000-0000-0000-000000000002"), "first_name": "Carlos Luis",  "last_name": "Martínez Núñez",     "cedula": "001-2345678-9", "phone": "+18092345002", "email": "c.martinez@hotmail.com",      "nationality": "Dominicana"},
    {"id": UUID("c0000000-0000-0000-0000-000000000003"), "first_name": "Ana Beatriz",  "last_name": "Pérez de la Cruz",   "cedula": "001-3456789-0", "phone": "+18093456003", "email": "ana.perez@gmail.com",         "nationality": "Dominicana"},
    {"id": UUID("c0000000-0000-0000-0000-000000000004"), "first_name": "José Antonio", "last_name": "García Fernández",   "cedula": "001-4567890-1", "phone": "+18094567004", "email": "j.garcia@outlook.com",        "nationality": "Dominicana"},
    {"id": UUID("c0000000-0000-0000-0000-000000000005"), "first_name": "Carmen Alicia","last_name": "Díaz Almonte",       "cedula": "001-5678901-2", "phone": "+18095678005", "email": "c.diaz@gmail.com",            "nationality": "Dominicana"},
    {"id": UUID("c0000000-0000-0000-0000-000000000006"), "first_name": "Roberto",      "last_name": "Sánchez Belliard",   "cedula": "001-6789012-3", "phone": "+18096789006", "email": "r.sanchez@gmail.com",         "nationality": "Dominicana"},
    {"id": UUID("c0000000-0000-0000-0000-000000000007"), "first_name": "Luisa María",  "last_name": "Torres Espaillat",   "cedula": "001-7890123-4", "phone": "+18097890007", "email": "l.torres@hotmail.com",        "nationality": "Dominicana"},
    {"id": UUID("c0000000-0000-0000-0000-000000000008"), "first_name": "Fernando",     "last_name": "Jiménez Batista",    "cedula": "001-8901234-5", "phone": "+18098901008", "email": "f.jimenez@gmail.com",         "nationality": "Dominicana"},
    {"id": UUID("c0000000-0000-0000-0000-000000000009"), "first_name": "Paola",        "last_name": "Medina Castillo",    "cedula": "001-9012345-6", "phone": "+18099012009", "email": "p.medina@gmail.com",          "nationality": "Dominicana"},
    {"id": UUID("c0000000-0000-0000-0000-000000000010"), "first_name": "Ramón",        "last_name": "Herrera Valdez",     "cedula": "001-0123456-7", "phone": "+18090123010", "email": "r.herrera@outlook.com",       "nationality": "Dominicana"},
    {"id": UUID("c0000000-0000-0000-0000-000000000011"), "first_name": "Verónica",     "last_name": "Santos Polanco",     "cedula": "002-1234567-8", "phone": "+18091234011", "email": "v.santos@gmail.com",          "nationality": "Dominicana"},
    {"id": UUID("c0000000-0000-0000-0000-000000000012"), "first_name": "Miguel Angel", "last_name": "Reyes Inoa",         "cedula": "002-2345678-9", "phone": "+18092345012", "email": "m.reyes@gmail.com",           "nationality": "Dominicana"},
    # Tourist project clients (international)
    {"id": UUID("c0000000-0000-0000-0000-000000000013"), "first_name": "James",        "last_name": "Williams",           "cedula": "USA-789456123", "phone": "+17863344013", "email": "j.williams@gmail.com",        "nationality": "Estadounidense"},
    {"id": UUID("c0000000-0000-0000-0000-000000000014"), "first_name": "Isabella",     "last_name": "Müller",             "cedula": "DEU-456123789", "phone": "+4917644014",  "email": "i.muller@gmail.com",          "nationality": "Alemana"},
    {"id": UUID("c0000000-0000-0000-0000-000000000015"), "first_name": "Andrés",       "last_name": "Vargas Correa",      "cedula": "COL-321654987", "phone": "+573001234015", "email": "a.vargas@gmail.com",          "nationality": "Colombiana"},
]


async def seed_synthetic_data(db: AsyncSession) -> None:
    # Top-level check: only skip if projects don't exist yet (first boot)
    # Each sub-seeder has its own idempotency check so we can run new ones
    # independently on an existing DB (e.g., after adding new modules).
    existing = await db.scalar(select(ProjectORM).limit(1))
    if existing:
        # DB already has core data — only run sub-seeders that may be new
        logger.info("[SEED] Core data present — running incremental sub-seeders...")
        await _seed_leads(db)
        await _seed_gestion(db)
        await _seed_postventa(db)
        await _seed_calendar_events(db)
        await db.commit()
        return

    logger.info("[SEED] Loading synthetic DUPE demo data...")
    today = date.today()

    # ── Projects ────────────────────────────────────────────────────────────────
    project_units: dict[UUID, list[UUID]] = {}
    project_budgets: dict[UUID, UUID] = {}

    for idx, proj_data in enumerate(PROJECTS):
        proj = ProjectORM(**proj_data)
        db.add(proj)
        await db.flush()

        # Units (realistic pricing per Excel)
        unit_ids: list[UUID] = []
        price_per_unit = (
            Decimal("3460000.00") if proj_data["currency"] == "DOP" and idx == 0
            else Decimal("3460000.00") if proj_data["currency"] == "DOP"
            else Decimal("330000.00")   # USD tourist
        )
        for u in range(1, proj_data["total_units"] + 1):
            unit = UnitORM(
                id=uuid4(),
                project_id=proj.id,
                unit_number=f"{u:03d}",
                floor=((u - 1) // 10) + 1,
                area_sqm=Decimal("60.83") if proj_data["currency"] == "DOP" else Decimal("110.00"),
                list_price=price_per_unit + Decimal(str((u % 5) * 50000)),
                is_sold=u <= int(proj_data["total_units"] * 0.65),  # 65% sold
            )
            db.add(unit)
            unit_ids.append(unit.id)

        project_units[proj.id] = unit_ids
        await db.flush()

        # Budget
        budget = BudgetORM(
            id=uuid4(),
            project_id=proj.id,
            version=1,
            approved_date=proj_data["start_date"],
        )
        db.add(budget)
        await db.flush()
        project_budgets[proj.id] = budget.id

        partidas = PARTIDAS_TOURIST if proj_data["currency"] == "USD" else PARTIDAS_SOCIAL
        for p in partidas:
            partida = PartidaORM(
                id=uuid4(),
                budget_id=budget.id,
                code=p["code"],
                name=p["name"],
                partida_type=p["type"],
                budgeted_amount=p["budget"],
            )
            db.add(partida)
            await db.flush()

            if p["executed"] > 0:
                db.add(PartidaExecutionORM(
                    id=uuid4(),
                    budget_id=budget.id,
                    partida_id=partida.id,
                    project_id=proj.id,
                    amount=p["executed"],
                    execution_date=today - timedelta(days=15),
                    description=f"Ejecución acumulada — {p['name']}",
                    entered_by="seed",
                ))

    await db.flush()

    # ── Clients ─────────────────────────────────────────────────────────────────
    for cl in CLIENTS:
        db.add(ClientORM(
            id=cl["id"],
            first_name=cl["first_name"],
            last_name=cl["last_name"],
            id_number=cl["cedula"],
            phone_whatsapp=cl["phone"],
            email=cl["email"],
            nationality=cl["nationality"],
        ))
    await db.flush()

    # ── Payment Plans — Fase I (social interest) ─────────────────────────────
    proj1_id = PROJECTS[0]["id"]
    unit_ids_p1 = project_units[proj1_id]

    # (client_id, num_installments, sale_date, overdue_scenario)
    # Overdue scenarios: 'ok', 'officer' (D+1..5), 'management' (D+6..15), 'legal' (D+16+)
    plan_configs = [
        (CLIENTS[0]["id"],  12, today - timedelta(days=365), "ok"),         # 12 months in, all paid
        (CLIENTS[1]["id"],  12, today - timedelta(days=270), "ok"),         # 9 months in, current
        (CLIENTS[2]["id"],  12, today - timedelta(days=210), "officer"),    # 1 installment D+3
        (CLIENTS[3]["id"],  10, today - timedelta(days=300), "management"), # 1 installment D+9
        (CLIENTS[4]["id"],  12, today - timedelta(days=420), "legal"),      # 1 installment D+22
        (CLIENTS[5]["id"],  8,  today - timedelta(days=150), "ok"),         # recent, current
        (CLIENTS[6]["id"],  12, today - timedelta(days=180), "officer"),    # 2 installments D+4
        (CLIENTS[7]["id"],  12, today - timedelta(days=240), "management"), # 1 installment D+11
        (CLIENTS[8]["id"],  10, today - timedelta(days=90),  "ok"),         # recent, no overdue
        (CLIENTS[9]["id"],  12, today - timedelta(days=330), "legal"),      # D+18 → legal
        (CLIENTS[10]["id"], 12, today - timedelta(days=60),  "ok"),         # very recent
        (CLIENTS[11]["id"], 8,  today - timedelta(days=120), "ok"),
    ]

    for idx, (client_id, num_inst, sale_date, scenario) in enumerate(plan_configs):
        if idx >= len(unit_ids_p1):
            break
        unit_id = unit_ids_p1[idx]
        unit_price = Decimal("3460000.00") + Decimal(str((idx % 5) * 50000))
        inst_amount = (unit_price / num_inst).quantize(Decimal("0.01"))

        plan = PaymentPlanORM(
            id=uuid4(),
            client_id=client_id,
            unit_id=unit_id,
            project_id=proj1_id,
            sale_date=sale_date,
            total_amount=unit_price,
            is_active=True,
            approved_by="gerencia@dupedesa.com",
        )
        db.add(plan)
        await db.flush()

        notification_ids = []
        for i in range(num_inst):
            due = sale_date + relativedelta(months=i + 1)
            days_past = (today - due).days if due < today else 0

            # Determine status based on scenario and position
            is_last = (i == num_inst - 1)
            is_recent_past = (0 < days_past <= 30)

            if due > today:
                status, paid_date, paid_amount, days_ov, esc = "pending", None, None, 0, "none"
            elif scenario == "ok" or not is_last:
                # All paid
                status = "paid"
                paid_date = due + timedelta(days=2)
                paid_amount = inst_amount
                days_ov, esc = 0, "none"
            elif scenario == "officer" and is_last:
                overdue_days = max(1, min(days_past, 5))
                status, paid_date, paid_amount = "overdue", None, None
                days_ov, esc = overdue_days, "officer"
            elif scenario == "management" and is_last:
                overdue_days = max(6, min(days_past, 15))
                status, paid_date, paid_amount = "overdue", None, None
                days_ov, esc = overdue_days, "management"
            elif scenario == "legal" and is_last:
                overdue_days = max(16, min(days_past, 45))
                status, paid_date, paid_amount = "overdue", None, None
                days_ov, esc = overdue_days, "legal"
            else:
                status = "paid"
                paid_date = due + timedelta(days=2)
                paid_amount = inst_amount
                days_ov, esc = 0, "none"

            inst = InstallmentORM(
                id=uuid4(),
                plan_id=plan.id,
                installment_number=i + 1,
                due_date=due,
                amount=inst_amount,
                status=status,
                paid_date=paid_date,
                paid_amount=paid_amount,
                escalation_level=esc,
                days_overdue=days_ov,
            )
            db.add(inst)

            # Seed notification records for paid installments
            if status == "paid":
                db.add(NotificationORM(
                    id=uuid4(),
                    installment_id=inst.id,
                    client_id=client_id,
                    channel="whatsapp",
                    trigger="receipt",
                    recipient=next(c["phone"] for c in CLIENTS if c["id"] == client_id),
                    template_key="receipt_payment",
                    template_vars=f'{{"amount": "{inst_amount}", "installment": {i+1}}}',
                    status="sent",
                    sent_at=paid_date,
                    provider_message_id=f"SYNTHETIC-{uuid4().hex[:12]}",
                ))
            elif status == "overdue":
                trigger = {"officer": "overdue_1", "management": "overdue_6", "legal": "overdue_16"}[esc]
                db.add(NotificationORM(
                    id=uuid4(),
                    installment_id=inst.id,
                    client_id=client_id,
                    channel="whatsapp",
                    trigger=trigger,
                    recipient=next(c["phone"] for c in CLIENTS if c["id"] == client_id),
                    template_key=f"overdue_{esc}",
                    template_vars=f'{{"days": {days_ov}, "amount": "{inst_amount}"}}',
                    status="sent",
                    sent_at=today - timedelta(days=1),
                    provider_message_id=f"SYNTHETIC-{uuid4().hex[:12]}",
                ))

        await db.flush()

    # ── Tourist project — 3 plans ─────────────────────────────────────────────
    proj3_id = PROJECTS[2]["id"]
    unit_ids_p3 = project_units[proj3_id]
    tourist_configs = [
        (CLIENTS[12]["id"], 12, today - timedelta(days=120), "ok"),
        (CLIENTS[13]["id"], 10, today - timedelta(days=60),  "ok"),
        (CLIENTS[14]["id"], 12, today - timedelta(days=90),  "officer"),
    ]
    for idx, (client_id, num_inst, sale_date, scenario) in enumerate(tourist_configs):
        unit_id = unit_ids_p3[idx]
        unit_price = Decimal("330000.00")
        inst_amount = (unit_price / num_inst).quantize(Decimal("0.01"))

        plan = PaymentPlanORM(
            id=uuid4(),
            client_id=client_id,
            unit_id=unit_id,
            project_id=proj3_id,
            sale_date=sale_date,
            total_amount=unit_price,
            is_active=True,
            approved_by="gerencia@dupedesa.com",
        )
        db.add(plan)
        await db.flush()

        for i in range(num_inst):
            due = sale_date + relativedelta(months=i + 1)
            if due > today:
                status, paid_date, paid_amount, days_ov, esc = "pending", None, None, 0, "none"
            elif scenario == "officer" and i == num_inst - 1:
                status, paid_date, paid_amount = "overdue", None, None
                days_ov, esc = 4, "officer"
            else:
                status = "paid"
                paid_date = due + timedelta(days=3)
                paid_amount = inst_amount
                days_ov, esc = 0, "none"

            db.add(InstallmentORM(
                id=uuid4(),
                plan_id=plan.id,
                installment_number=i + 1,
                due_date=due,
                amount=inst_amount,
                status=status,
                paid_date=paid_date,
                paid_amount=paid_amount,
                escalation_level=esc,
                days_overdue=days_ov,
            ))
        await db.flush()

    # ── Cash Flow Monthly ────────────────────────────────────────────────────────
    await _seed_cashflow(db, project_budgets)

    # ── Invoices (Contabilidad) ──────────────────────────────────────────────────
    await _seed_invoices(db, project_budgets)

    # ── Officer Goals ────────────────────────────────────────────────────────────
    await _seed_goals(db)

    # ── Comercial leads ───────────────────────────────────────────────────────────
    await _seed_leads(db)

    # ── Gestión cases ─────────────────────────────────────────────────────────────
    await _seed_gestion(db)

    # ── Postventa cases ───────────────────────────────────────────────────────────
    await _seed_postventa(db)

    # ── Business Calendar events ──────────────────────────────────────────────────
    await _seed_calendar_events(db)

    await db.commit()
    logger.info("[SEED] Synthetic DUPE data loaded: 3 projects, 15 clients, payment plans, invoices, goals, leads, gestion, postventa, calendar")


async def _seed_cashflow(db: AsyncSession, project_budgets: dict) -> None:
    """Seed cash flow data from the DUPE Excel financial model."""
    import os
    from decimal import Decimal
    from dupe_platform.integrations.excel_cashflow_parser import (
        parse_social_cashflow, parse_tourist_cashflow,
    )

    # Locate the Excel file — try known paths
    excel_candidates = [
        "/app/inputs/MODELOS FINANCIEROS DUPE - PROYECTOS TURISTICOS Y DE INTERES SOCIAL.xlsx",
        "inputs/MODELOS FINANCIEROS DUPE - PROYECTOS TURISTICOS Y DE INTERES SOCIAL.xlsx",
        os.path.join(os.path.dirname(__file__), "../../../../inputs/MODELOS FINANCIEROS DUPE - PROYECTOS TURISTICOS Y DE INTERES SOCIAL.xlsx"),
    ]
    excel_path = None
    for p in excel_candidates:
        if os.path.exists(p):
            excel_path = p
            break

    if excel_path:
        social_records = parse_social_cashflow(excel_path)
        tourist_records = parse_tourist_cashflow(excel_path)
        logger.info("[SEED] Parsed %d social + %d tourist CF months from Excel", len(social_records), len(tourist_records))
    else:
        from dupe_platform.integrations.excel_cashflow_parser import _get_synthetic_social, _get_synthetic_tourist
        social_records = _get_synthetic_social()
        tourist_records = _get_synthetic_tourist()
        logger.info("[SEED] Excel not found — using synthetic cash flow data")

    # Project IDs from PROJECTS list
    proj_social1_id = PROJECTS[0]["id"]   # Don Memendo Fase 1
    proj_social2_id = PROJECTS[1]["id"]   # Don Memendo Fase 3
    proj_tourist_id = PROJECTS[2]["id"]   # Juan Dolio

    def _insert_records(project_id, records):
        for r in records:
            db.add(CashFlowMonthlyORM(
                id=uuid4(),
                project_id=project_id,
                month=r.month,
                month_number=r.month_number,
                is_actual=r.is_actual,
                income=Decimal(str(round(r.income, 2))),
                expenses=Decimal(str(round(r.expenses, 2))),
                net_cash_flow=Decimal(str(round(r.net_cash_flow, 2))),
                cumulative_balance=Decimal(str(round(r.cumulative_balance, 2))),
                income_separaciones=Decimal(str(round(r.income_separaciones, 2))),
                income_entregas=Decimal(str(round(r.income_entregas, 2))),
                income_financiamiento=Decimal(str(round(r.income_financiamiento, 2))),
                exp_construccion=Decimal(str(round(r.exp_construccion, 2))),
                exp_suelo=Decimal(str(round(r.exp_suelo, 2))),
                exp_tecnicos=Decimal(str(round(r.exp_tecnicos, 2))),
                exp_juridico=Decimal(str(round(r.exp_juridico, 2))),
                exp_financiero=Decimal(str(round(r.exp_financiero, 2))),
                exp_gestion=Decimal(str(round(r.exp_gestion, 2))),
                exp_comercializacion=Decimal(str(round(r.exp_comercializacion, 2))),
            ))

    _insert_records(proj_social1_id, social_records)
    _insert_records(proj_social2_id, social_records)  # same model, Fase 3 starts later
    _insert_records(proj_tourist_id, tourist_records)
    await db.flush()
    logger.info("[SEED] Cash flow monthly records inserted")


async def _seed_invoices(db: AsyncSession, project_budgets: dict) -> None:
    """Seed realistic supplier invoices for Contabilidad demo."""
    # Check idempotency
    from sqlalchemy import select, func
    r = await db.execute(select(func.count(InvoiceORM.id)))
    if r.scalar() > 0:
        logger.info("[SEED] Invoices already exist — skipping")
        return

    social1_id = PROJECTS[0]["id"]
    today = date.today()

    invoices = [
        # Pagadas (paid)
        dict(project_id=social1_id, invoice_date=date(2025, 1, 10), proveedor="Constructora DAZA, SRL",        ncf="B0100000001", tipo="factura", partida_code="GAS-002", description="Pago certificación avance obra — enero 2025",  amount=Decimal("8200000.00"),  status="pagada", entered_by="Carlos Mena"),
        dict(project_id=social1_id, invoice_date=date(2025, 2, 5),  proveedor="Consultora Técnica Arq & Ing",  ncf="B0100000002", tipo="factura", partida_code="GAS-003", description="Honorarios diseño estructural fase 1",          amount=Decimal("1164840.50"),  status="pagada", entered_by="Carlos Mena"),
        dict(project_id=social1_id, invoice_date=date(2025, 3, 15), proveedor="Constructora DAZA, SRL",        ncf="B0100000003", tipo="factura", partida_code="GAS-002", description="Pago certificación avance obra — marzo 2025",  amount=Decimal("9500000.00"),  status="pagada", entered_by="Ana Rodríguez"),
        dict(project_id=social1_id, invoice_date=date(2025, 4, 3),  proveedor="Notaría García & Asociados",    ncf="B0100000004", tipo="factura", partida_code="GAS-005", description="Constitución de condominio — escrituras",       amount=Decimal("850000.00"),   status="pagada", entered_by="Carlos Mena"),
        dict(project_id=social1_id, invoice_date=date(2025, 5, 20), proveedor="Banco BHD León",                ncf="",            tipo="recibo",  partida_code="GAS-006", description="Intereses préstamo construcción — mayo",       amount=Decimal("2394000.00"),  status="pagada", entered_by="Ana Rodríguez"),
        dict(project_id=social1_id, invoice_date=date(2025, 6, 8),  proveedor="Agencia Publicidad Merengue",   ncf="B0100000005", tipo="factura", partida_code="GAS-007", description="Campaña lanzamiento Fase 1 — digital + OOH",   amount=Decimal("3800000.00"),  status="pagada", entered_by="Carlos Mena"),
        dict(project_id=social1_id, invoice_date=date(2025, 7, 12), proveedor="Constructora DAZA, SRL",        ncf="B0100000006", tipo="factura", partida_code="GAS-002", description="Pago certificación avance obra — julio 2025",  amount=Decimal("11250000.00"), status="pagada", entered_by="Ana Rodríguez"),
        dict(project_id=social1_id, invoice_date=date(2025, 8, 5),  proveedor="Banco BHD León",                ncf="",            tipo="recibo",  partida_code="GAS-006", description="Intereses préstamo construcción — agosto",     amount=Decimal("2394000.00"),  status="pagada", entered_by="Carlos Mena"),
        dict(project_id=social1_id, invoice_date=date(2025, 9, 18), proveedor="Constructora DAZA, SRL",        ncf="B0100000007", tipo="factura", partida_code="GAS-002", description="Pago certificación avance obra — sept 2025",   amount=Decimal("12000000.00"), status="pagada", entered_by="Ana Rodríguez"),
        dict(project_id=social1_id, invoice_date=date(2025, 10, 2), proveedor="Topógrafo Ruiz & Cía",          ncf="B0100000008", tipo="recibo",  partida_code="GAS-003", description="Levantamiento topográfico Fase 2",             amount=Decimal("185000.00"),   status="pagada", entered_by="Carlos Mena"),
        dict(project_id=social1_id, invoice_date=date(2025, 11, 7), proveedor="Constructora DAZA, SRL",        ncf="B0100000009", tipo="factura", partida_code="GAS-002", description="Pago certificación avance obra — nov 2025",    amount=Decimal("9800000.00"),  status="pagada", entered_by="Ana Rodríguez"),
        dict(project_id=social1_id, invoice_date=date(2025, 12, 4), proveedor="Banco BHD León",                ncf="",            tipo="recibo",  partida_code="GAS-006", description="Intereses préstamo construcción — dic 2025",   amount=Decimal("2394000.00"),  status="pagada", entered_by="Carlos Mena"),
        # Pendientes (unpaid — current year)
        dict(project_id=social1_id, invoice_date=date(2026, 1, 10), proveedor="Constructora DAZA, SRL",        ncf="B0100000010", tipo="factura", partida_code="GAS-002", description="Pago certificación avance obra — ene 2026",   amount=Decimal("10500000.00"), status="pendiente", entered_by="Ana Rodríguez"),
        dict(project_id=social1_id, invoice_date=date(2026, 2, 14), proveedor="Gestión Inmobiliaria HCL",      ncf="B0100000011", tipo="factura", partida_code="GAS-004", description="Honorarios gestión integral — Q1 2026",        amount=Decimal("3500000.00"),  status="pendiente", entered_by="Carlos Mena"),
        dict(project_id=social1_id, invoice_date=date(2026, 3, 1),  proveedor="Banco BHD León",                ncf="",            tipo="recibo",  partida_code="GAS-006", description="Intereses préstamo construcción — Q1 2026",   amount=Decimal("2394000.00"),  status="pendiente", entered_by="Ana Rodríguez"),
        dict(project_id=social1_id, invoice_date=date(2026, 4, 5),  proveedor="Constructora DAZA, SRL",        ncf="B0100000012", tipo="factura", partida_code="GAS-002", description="Pago certificación avance obra — abr 2026",   amount=Decimal("11200000.00"), status="pendiente", entered_by="Ana Rodríguez"),
        dict(project_id=social1_id, invoice_date=date(2026, 5, 20), proveedor="Notaría García & Asociados",    ncf="B0100000013", tipo="factura", partida_code="GAS-005", description="Gestión documental unidades 50–100",           amount=Decimal("1200000.00"),  status="pendiente", entered_by="Carlos Mena"),
        dict(project_id=social1_id, invoice_date=date(2026, 6, 3),  proveedor="Agencia Publicidad Merengue",   ncf="B0100000014", tipo="factura", partida_code="GAS-007", description="Campaña digital junio — redes sociales",       amount=Decimal("1800000.00"),  status="pendiente", entered_by="Ana Rodríguez"),
        # Anulada
        dict(project_id=social1_id, invoice_date=date(2025, 6, 15), proveedor="Proveedor X, SRL",              ncf="B0100000099", tipo="factura", partida_code="GAS-002", description="Factura duplicada — anulada",                 amount=Decimal("5000000.00"),  status="anulada",  entered_by="Carlos Mena"),
    ]

    for inv_data in invoices:
        db.add(InvoiceORM(id=uuid4(), **inv_data))

    await db.flush()
    logger.info("[SEED] %d invoices inserted", len(invoices))


async def _seed_goals(db: AsyncSession) -> None:
    """Seed officer goals for demo — 3 officers across 3 departments."""
    from sqlalchemy import select, func
    r = await db.execute(select(func.count(OfficerGoalORM.id)))
    if r.scalar() > 0:
        logger.info("[SEED] Goals already exist — skipping")
        return

    today = date.today()
    # Current and previous month periods
    yr, mo = today.year, today.month
    this_period = f"{yr}-{mo:02d}"
    prev_mo = mo - 1 if mo > 1 else 12
    prev_yr = yr if mo > 1 else yr - 1
    prev_period = f"{prev_yr}-{prev_mo:02d}"

    goals = [
        # Cobros officers
        dict(department="cobros", officer_name="Lourdes Jiménez", metric_name="Monto cobrado",        metric_unit="RD$", target_value=Decimal("4000000.00"), period=this_period),
        dict(department="cobros", officer_name="Lourdes Jiménez", metric_name="Monto cobrado",        metric_unit="RD$", target_value=Decimal("3800000.00"), period=prev_period),
        dict(department="cobros", officer_name="Pedro Almonte",   metric_name="Monto cobrado",        metric_unit="RD$", target_value=Decimal("3500000.00"), period=this_period),
        dict(department="cobros", officer_name="Pedro Almonte",   metric_name="Monto cobrado",        metric_unit="RD$", target_value=Decimal("3200000.00"), period=prev_period),
        # Finanzas officers
        dict(department="finanzas", officer_name="Carlos Mena",     metric_name="Facturas registradas", metric_unit="unidades", target_value=Decimal("8.00"),       period=this_period),
        dict(department="finanzas", officer_name="Ana Rodríguez",   metric_name="Facturas registradas", metric_unit="unidades", target_value=Decimal("6.00"),       period=this_period),
        dict(department="finanzas", officer_name="Carlos Mena",     metric_name="Facturas registradas", metric_unit="unidades", target_value=Decimal("8.00"),       period=prev_period),
        # Gestión officers
        dict(department="gestion",  officer_name="Mariela Torres",  metric_name="Contratos firmados",   metric_unit="unidades", target_value=Decimal("5.00"),       period=this_period),
        dict(department="gestion",  officer_name="Mariela Torres",  metric_name="Contratos firmados",   metric_unit="unidades", target_value=Decimal("4.00"),       period=prev_period),
    ]

    for g in goals:
        db.add(OfficerGoalORM(id=uuid4(), notes="", **g))

    await db.flush()
    logger.info("[SEED] %d officer goals inserted", len(goals))


async def _seed_leads(db: AsyncSession) -> None:
    from sqlalchemy import select, func
    r = await db.execute(select(func.count(LeadORM.id)))
    if r.scalar() > 0:
        logger.info("[SEED] Leads already exist — skipping")
        return

    sellers = ["Ana María Reyes", "Carlos Domínguez", "Paola Jiménez", "Miguel Santana", "Laura Fernández"]
    p1 = PROJECTS[0]["id"]   # Don Memendo Fase 1 (social)
    p3 = PROJECTS[2]["id"]   # Juan Dolio (tourist)

    leads_data = [
        # ── Don Memendo Fase 1 leads ──────────────────────────────────────────
        dict(project_id=p1, first_name="Fernando",   last_name="Castro Blanco",     phone="+18091110001", email="f.castro@gmail.com",     source="facebook",  status="nuevo",      qualification_score=0, assigned_seller=sellers[0], notes="Vio anuncio en FB. Primera llamada pendiente."),
        dict(project_id=p1, first_name="Isabel",     last_name="Mejía Soto",         phone="+18091110002", email="i.mejia@hotmail.com",    source="instagram", status="contactado", qualification_score=2, assigned_seller=sellers[1], notes="Contactada 12/06. Interesada en 3 habitaciones. Pide precio final."),
        dict(project_id=p1, first_name="Raúl",       last_name="Herrera Matos",      phone="+18091110003", email="r.herrera@gmail.com",    source="referido",  status="calificado", qualification_score=4, assigned_seller=sellers[2], notes="Referido por cliente C-004. Ingresos verificados. Listo para separar."),
        dict(project_id=p1, first_name="Claudia",    last_name="Núñez Peralta",      phone="+18091110004", email="c.nunez@gmail.com",      source="portal",    status="calificado", qualification_score=3, assigned_seller=sellers[3], notes="Visitó sala de ventas 10/06. Quiere unidad en piso 3+."),
        dict(project_id=p1, first_name="Javier",     last_name="Reyes de la Cruz",   phone="+18091110005", email="j.reyes@outlook.com",    source="evento",    status="reservado",  qualification_score=5, assigned_seller=sellers[4], notes="Separó unidad 045 en feria 01/06. Pendiente firma contrato."),
        dict(project_id=p1, first_name="Patricia",   last_name="Almonte Guerrero",   phone="+18091110006", email="p.almonte@gmail.com",    source="facebook",  status="descartado", qualification_score=1, assigned_seller=sellers[0], notes="No calificó para financiamiento bancario. Score 520."),
        dict(project_id=p1, first_name="Marcos",     last_name="Suárez Valdez",      phone="+18091110007", email="m.suarez@gmail.com",     source="instagram", status="nuevo",      qualification_score=0, assigned_seller=sellers[1], notes="Dejó datos en Instagram. Aún no contactado."),
        dict(project_id=p1, first_name="Lucía",      last_name="Familia Barreiro",   phone="+18091110008", email="l.familia@hotmail.com",  source="referido",  status="contactado", qualification_score=2, assigned_seller=sellers[2], notes="Llamada realizada 14/06. Quiere recorrido de obra."),
        dict(project_id=p1, first_name="Andrés",     last_name="Polanco Taveras",    phone="+18091110009", email="a.polanco@gmail.com",    source="portal",    status="calificado", qualification_score=4, assigned_seller=sellers[3], notes="Pre-aprobado BanReservas RD$3.5M. Buscando fecha para separar."),
        dict(project_id=p1, first_name="Gabriela",   last_name="Montero Cabral",     phone="+18091110010", email="g.montero@gmail.com",    source="facebook",  status="nuevo",      qualification_score=0, assigned_seller=sellers[4], notes="Formulario web completado anoche. Seguimiento mañana."),
        dict(project_id=p1, first_name="Nelson",     last_name="Then Guerrero",      phone="+18091110011", email="n.then@gmail.com",       source="evento",    status="contactado", qualification_score=3, assigned_seller=sellers[0], notes="Feria de vivienda 08/06. Trabaja en sector público."),
        dict(project_id=p1, first_name="Rosa",       last_name="Bautista Cuevas",    phone="+18091110012", email="r.bautista@hotmail.com", source="referido",  status="calificado", qualification_score=5, assigned_seller=sellers[1], notes="Doble ingreso familiar. Pre-aprobación en proceso. Alta prioridad."),
        dict(project_id=p1, first_name="Emilio",     last_name="Taveras Díaz",       phone="+18091110013", email="e.taveras@gmail.com",    source="instagram", status="descartado", qualification_score=2, assigned_seller=sellers[2], notes="Cambió de opinión. Prefiere alquiler por ahora."),
        dict(project_id=p1, first_name="Carmen",     last_name="Guerrero Lora",      phone="+18091110014", email="c.guerrero@gmail.com",   source="portal",    status="reservado",  qualification_score=5, assigned_seller=sellers[3], notes="Separó unidad 067 el 05/06. Contrato esta semana."),
        dict(project_id=p1, first_name="Victor",     last_name="Ureña Rosario",      phone="+18091110015", email="v.urena@outlook.com",    source="facebook",  status="nuevo",      qualification_score=0, assigned_seller=sellers[4], notes=""),
        # ── Juan Dolio (tourist) leads ────────────────────────────────────────
        dict(project_id=p3, first_name="James",      last_name="Thompson",           phone="+13057110016", email="j.thompson@gmail.com",   source="portal",    status="calificado", qualification_score=5, assigned_seller=sellers[0], notes="Miami buyer. Cash purchase likely. Wants golf view unit."),
        dict(project_id=p3, first_name="Sophie",     last_name="Dubois",             phone="+33612110017", email="s.dubois@gmail.com",     source="referido",  status="contactado", qualification_score=3, assigned_seller=sellers[1], notes="Referred by Müller family (C-014). French, wants sea view."),
        dict(project_id=p3, first_name="Carlos",     last_name="Mendoza Ríos",       phone="+573001110018", email="c.mendoza@gmail.com",   source="evento",    status="calificado", qualification_score=4, assigned_seller=sellers[2], notes="Miami Homes Expo. Colombian investor. Already owns 2 DR properties."),
        dict(project_id=p3, first_name="Katja",      last_name="Brenner",            phone="+4915110019",  email="k.brenner@gmail.com",    source="instagram", status="nuevo",      qualification_score=0, assigned_seller=sellers[3], notes="Saw Insta reel of Juan Dolio. Asked about fractional ownership."),
        dict(project_id=p3, first_name="Michael",    last_name="O'Brien",            phone="+13054110020", email="m.obrien@outlook.com",   source="portal",    status="descartado", qualification_score=2, assigned_seller=sellers[4], notes="Budget was $200K. Out of range for tourist villas."),
    ]
    for i, d in enumerate(leads_data):
        db.add(LeadORM(id=uuid4(), **d))
    await db.flush()
    logger.info("[SEED] %d leads inserted", len(leads_data))


async def _seed_gestion(db: AsyncSession) -> None:
    import json as _json
    from sqlalchemy import select, func
    r = await db.execute(select(func.count(GestionCaseORM.id)))
    if r.scalar() > 0:
        logger.info("[SEED] Gestión cases already exist — skipping")
        return

    p1 = PROJECTS[0]["id"]   # Don Memendo
    p3 = PROJECTS[2]["id"]   # Juan Dolio
    officers = ["Mariela Torres", "Rafael Guzmán", "Yolanda Vargas"]

    def _make_fid_history(fid_status: str, started_days_ago: int) -> str:
        now = datetime.utcnow()
        history = [{
            "status": "recoleccion_firma",
            "entered_at": (now - timedelta(days=started_days_ago)).isoformat(),
        }]
        if fid_status in ("enviado_fiduciaria", "cliente_vinculado"):
            days_in = max(3, started_days_ago - 4)
            history[0]["exited_at"] = (now - timedelta(days=started_days_ago - days_in)).isoformat()
            history[0]["days_in_state"] = days_in
            history.append({
                "status": "enviado_fiduciaria",
                "entered_at": (now - timedelta(days=started_days_ago - days_in)).isoformat(),
            })
        if fid_status == "cliente_vinculado":
            history[-1]["exited_at"] = (now - timedelta(days=2)).isoformat()
            history[-1]["days_in_state"] = max(2, started_days_ago - 5)
            history.append({
                "status": "cliente_vinculado",
                "entered_at": (now - timedelta(days=2)).isoformat(),
            })
        return _json.dumps(history)

    cases = [
        # ── recoleccion_firma (docs mostly pending) ───────────────────────────
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000001"), project_id=p1, officer=officers[0],
             fid="recoleccion_firma", days_ago=14, appt=date.today() + timedelta(days=3),
             doc_cedula="recibido", doc_carta="pendiente", doc_mov="pendiente", doc_cert="pendiente",
             notes="Cédula entregada en oficina. Pendiente carta de trabajo y movimientos bancarios."),
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000002"), project_id=p1, officer=officers[1],
             fid="recoleccion_firma", days_ago=7, appt=date.today() + timedelta(days=5),
             doc_cedula="recibido", doc_carta="recibido", doc_mov="pendiente", doc_cert="pendiente",
             notes="Documentación parcial. Esperando movimientos bancarios (3 meses)."),
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000009"), project_id=p1, officer=officers[2],
             fid="recoleccion_firma", days_ago=5, appt=None,
             doc_cedula="pendiente", doc_carta="pendiente", doc_mov="pendiente", doc_cert="pendiente",
             notes="Caso nuevo. Primer contacto de gestión realizado por WhatsApp."),
        # ── enviado_fiduciaria (all docs in, contract generated, sent) ────────
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000003"), project_id=p1, officer=officers[0],
             fid="enviado_fiduciaria", days_ago=20, appt=None,
             doc_cedula="recibido", doc_carta="recibido", doc_mov="recibido", doc_cert="recibido",
             notes="Todos los documentos verificados. Expediente enviado a fiduciaria el 05/06."),
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000010"), project_id=p1, officer=officers[1],
             fid="enviado_fiduciaria", days_ago=12, appt=None,
             doc_cedula="recibido", doc_carta="recibido", doc_mov="recibido", doc_cert="pendiente",
             notes="Certificación de vivienda enviada por correo. Pendiente versión original."),
        # ── cliente_vinculado (completed) ─────────────────────────────────────
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000004"), project_id=p1, officer=officers[2],
             fid="cliente_vinculado", days_ago=30, appt=None,
             doc_cedula="recibido", doc_carta="recibido", doc_mov="recibido", doc_cert="recibido",
             notes="Cliente vinculado exitosamente. Contrato notariado el 28/05."),
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000005"), project_id=p1, officer=officers[0],
             fid="cliente_vinculado", days_ago=45, appt=None,
             doc_cedula="recibido", doc_carta="recibido", doc_mov="recibido", doc_cert="recibido",
             notes="Vinculación completa. BanReservas financiamiento aprobado."),
        # ── Tourist project case ──────────────────────────────────────────────
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000013"), project_id=p3, officer=officers[1],
             fid="enviado_fiduciaria", days_ago=8, appt=None,
             doc_cedula="recibido", doc_carta="recibido", doc_mov="recibido", doc_cert="recibido",
             notes="International buyer (USA). Passport + wire transfer docs submitted."),
    ]

    for c in cases:
        contract_date = (
            datetime.utcnow() - timedelta(days=c["days_ago"] - 2)
            if c["fid"] in ("enviado_fiduciaria", "cliente_vinculado") else None
        )
        db.add(GestionCaseORM(
            id=uuid4(),
            client_id=c["client_id"],
            project_id=c["project_id"],
            assigned_officer=c["officer"],
            assigned_at=datetime.utcnow() - timedelta(days=c["days_ago"]),
            doc_cedula=c["doc_cedula"],
            doc_carta_trabajo=c["doc_carta"],
            doc_movimientos_bancarios=c["doc_mov"],
            doc_certificacion_vivienda=c["doc_cert"],
            fiduciaria_status=c["fid"],
            fiduciaria_updated_at=datetime.utcnow() - timedelta(days=c["days_ago"] // 2),
            fiduciaria_history=_make_fid_history(c["fid"], c["days_ago"]),
            contract_generated_at=contract_date,
            appointment_date=c.get("appt"),
            appointment_time="09:00" if c.get("appt") else None,
            notes=c["notes"],
        ))

    await db.flush()
    logger.info("[SEED] %d gestión cases inserted", len(cases))


async def _seed_postventa(db: AsyncSession) -> None:
    import json as _json
    from sqlalchemy import select, func
    r = await db.execute(select(func.count(PostventaCaseORM.id)))
    if r.scalar() > 0:
        logger.info("[SEED] Postventa cases already exist — skipping")
        return

    p1 = PROJECTS[0]["id"]
    p3 = PROJECTS[2]["id"]
    officers = ["Beatriz Ortega", "Héctor Sánchez", "Carmen Villalobos"]
    now = datetime.utcnow()
    today = date.today()

    def _make_pv_history(status: str, days_ago: int) -> str:
        h = [{"status": "preinspeccion",
              "entered_at": (now - timedelta(days=days_ago + 7)).isoformat(),
              "exited_at":  (now - timedelta(days=days_ago + 2)).isoformat(),
              "days_in_state": 5}]
        if status in ("en_revision", "listo", "correccion", "entregado"):
            h.append({"status": "en_revision",
                       "entered_at": (now - timedelta(days=days_ago + 2)).isoformat()})
        if status in ("correccion",):
            h[-1]["exited_at"] = (now - timedelta(days=days_ago)).isoformat()
            h[-1]["days_in_state"] = 2
            h.append({"status": "correccion",
                       "entered_at": (now - timedelta(days=days_ago)).isoformat()})
        if status in ("listo", "entregado"):
            h[-1]["exited_at"] = (now - timedelta(days=days_ago - 3)).isoformat()
            h[-1]["days_in_state"] = max(3, days_ago - 5)
            h.append({"status": "listo",
                       "entered_at": (now - timedelta(days=days_ago - 3)).isoformat()})
        if status == "entregado":
            h[-1]["exited_at"] = (now - timedelta(days=days_ago - 5)).isoformat()
            h[-1]["days_in_state"] = 2
            h.append({"status": "entregado",
                       "entered_at": (now - timedelta(days=days_ago - 5)).isoformat()})
        return _json.dumps(h)

    cases = [
        # preinspeccion — awaiting inspection visit
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000007"), project_id=p1, officer=officers[0],
             status="preinspeccion", days_ago=3, delivery_date=None,
             appt=today + timedelta(days=4),
             items=_json.dumps([]),
             notes="Visita de pre-inspección programada para el 23/06 a las 09:00."),
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000008"), project_id=p1, officer=officers[1],
             status="preinspeccion", days_ago=1, delivery_date=None,
             appt=today + timedelta(days=7),
             items=_json.dumps([]),
             notes="Caso nuevo — cliente confirmó disponibilidad para la semana del 26/06."),
        # en_revision — inspection done, constructor working on fixes
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000004"), project_id=p1, officer=officers[0],
             status="en_revision", days_ago=10, delivery_date=None,
             appt=None,
             items=_json.dumps([
                 {"area": "Habitación 1",   "defects": [{"defect": "Cerámica rota (2 piezas)", "notes": "Esquina NE"}, {"defect": "Masilla en marco de ventana", "notes": ""}], "notes": ""},
                 {"area": "Baño Principal", "defects": [{"defect": "Grifo de lavamanos con fuga", "notes": "Gota constante"}, {"defect": "Silicón faltante en bañera", "notes": ""}], "notes": ""},
                 {"area": "Cocina",         "defects": [{"defect": "Puerta de gabinete desalineada", "notes": "No cierra bien"}], "notes": ""},
                 {"area": "Sala/Comedor",   "defects": [], "notes": "Sin desperfectos"},
             ]),
             notes="Constructor notificado el 09/06. Plazo comprometido: 20/06."),
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000011"), project_id=p1, officer=officers[2],
             status="en_revision", days_ago=6, delivery_date=None,
             appt=None,
             items=_json.dumps([
                 {"area": "Balcón",     "defects": [{"defect": "Filtración en piso", "notes": "Visible al mojar"}], "notes": ""},
                 {"area": "Baño Social","defects": [{"defect": "Llave de paso dura", "notes": ""}], "notes": ""},
             ]),
             notes="Filtración requiere impermeabilización. Constructor tiene 15 días."),
        # correccion — sent back from revision
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000012"), project_id=p1, officer=officers[1],
             status="correccion", days_ago=4, delivery_date=None,
             appt=None,
             items=_json.dumps([
                 {"area": "Puertas",  "defects": [{"defect": "Puerta principal roza con piso", "notes": "Falta ajuste de bisagra"}], "notes": ""},
                 {"area": "Pintura",  "defects": [{"defect": "Manchas en techo sala", "notes": "3 manchas amarillas"}, {"defect": "Burbujas en pared norte", "notes": ""}], "notes": ""},
             ]),
             notes="Primera revisión rechazada. Corrección de pintura incompleta. Nueva cita 25/06."),
        # listo — ready for delivery
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000005"), project_id=p1, officer=officers[0],
             status="listo", days_ago=2, delivery_date=None,
             appt=today + timedelta(days=2),
             items=_json.dumps([
                 {"area": "Habitación 2", "defects": [{"defect": "Pintura descascarada", "notes": "Corregida"}], "notes": ""},
             ]),
             notes="Todos los desperfectos corregidos. Entrega programada para el 21/06."),
        # entregado with warranty (delivered 30 days ago)
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000006"), project_id=p1, officer=officers[2],
             status="entregado", days_ago=35, delivery_date=today - timedelta(days=30),
             appt=None,
             items=_json.dumps([
                 {"area": "Cocina", "defects": [{"defect": "Zócalo suelto", "notes": "Corregido"}], "notes": ""},
             ]),
             notes="Entregada el 20/05. Garantía vigente hasta 20/05/2027. Manual de convivencia enviado."),
        # tourist project entregado (warranty almost expired for urgency demo)
        dict(client_id=UUID("c0000000-0000-0000-0000-000000000013"), project_id=p3, officer=officers[1],
             status="entregado", days_ago=380, delivery_date=today - timedelta(days=340),
             appt=None,
             items=_json.dumps([]),
             notes="Villa entregada. Garantía expira en ~25 días. Contactar cliente."),
    ]

    for c in cases:
        delivery_date = c["delivery_date"]
        warranty_expiry = None
        if delivery_date:
            try:
                warranty_expiry = delivery_date.replace(year=delivery_date.year + 1)
            except ValueError:
                warranty_expiry = delivery_date + timedelta(days=365)
        days_ago = c["days_ago"]
        db.add(PostventaCaseORM(
            id=uuid4(),
            client_id=c["client_id"],
            project_id=c["project_id"],
            assigned_officer=c["officer"],
            status=c["status"],
            status_history=_make_pv_history(c["status"], days_ago),
            inspection_items=c["items"],
            inspection_submitted_at=now - timedelta(days=days_ago + 2) if c["status"] != "preinspeccion" else None,
            constructor_notified_at=now - timedelta(days=days_ago + 2) if c["status"] != "preinspeccion" else None,
            client_notified_at=now - timedelta(days=days_ago + 2) if c["status"] != "preinspeccion" else None,
            appointment_date=c.get("appt"),
            delivery_date=delivery_date,
            warranty_expiry_date=warranty_expiry,
            convivencia_sent_at=now - timedelta(days=days_ago - 5) if c["status"] == "entregado" else None,
            notes=c["notes"],
        ))

    await db.flush()
    logger.info("[SEED] %d postventa cases inserted", len(cases))


async def _seed_calendar_events(db: AsyncSession) -> None:
    from sqlalchemy import select, func
    r = await db.execute(select(func.count(CalendarEventORM.id)))
    if r.scalar() > 0:
        logger.info("[SEED] Calendar events already exist — skipping")
        return

    today = date.today()
    p1 = PROJECTS[0]["id"]
    p3 = PROJECTS[2]["id"]

    # Helper: offset from today
    def d(offset: int) -> date:
        return today + timedelta(days=offset)

    events = [
        # ── Gestión appointments ───────────────────────────────────────────────
        dict(title="Cita documentos — María Elena Rodríguez", event_type="gestion_appointment",
             project_id=p1, related_client_id=UUID("c0000000-0000-0000-0000-000000000001"),
             responsible_officer="Mariela Torres", event_date=d(3), start_time="09:00", end_time="09:45",
             status="scheduled", location="Oficina central DUPE — Piso 2",
             description="Revisión y entrega de documentos faltantes: carta de trabajo y movimientos bancarios (3 meses).",
             notes="Cliente confirmó por WhatsApp el 17/06."),
        dict(title="Cita documentos — Carlos Martínez", event_type="gestion_appointment",
             project_id=p1, related_client_id=UUID("c0000000-0000-0000-0000-000000000002"),
             responsible_officer="Rafael Guzmán", event_date=d(5), start_time="11:00", end_time="11:45",
             status="scheduled", location="Oficina central DUPE — Sala de Reuniones A",
             description="Entrega de movimientos bancarios y certificación de vivienda.",
             notes=""),
        dict(title="Firma contrato — Ana Pérez de la Cruz", event_type="gestion_appointment",
             project_id=p1, related_client_id=UUID("c0000000-0000-0000-0000-000000000003"),
             responsible_officer="Mariela Torres", event_date=d(-2), start_time="10:00", end_time="11:00",
             status="completed", location="Notaría Pérez & Asociados",
             description="Firma de contrato de compraventa y vinculación fiduciaria.",
             notes="Contrato firmado exitosamente. Copia enviada a ambas partes."),
        dict(title="Cita documentos — Paola Medina Castillo", event_type="gestion_appointment",
             project_id=p1, related_client_id=UUID("c0000000-0000-0000-0000-000000000009"),
             responsible_officer="Yolanda Vargas", event_date=d(8), start_time="14:00", end_time="14:45",
             status="scheduled", location="Oficina central DUPE — Piso 2",
             description="Primera cita de gestión. Explicación del proceso y entrega de lista de documentos.",
             notes=""),
        dict(title="Vinculación fiduciaria — James Williams", event_type="gestion_appointment",
             project_id=p3, related_client_id=UUID("c0000000-0000-0000-0000-000000000013"),
             responsible_officer="Rafael Guzmán", event_date=d(12), start_time="09:00", end_time="10:00",
             status="scheduled", location="Fiduciaria Nacional — Oficina JD",
             description="Vinculación final con fiduciaria. Cliente viaja desde Miami.",
             notes="Coordinar con intérprete para documentos en inglés."),

        # ── Postventa inspections ──────────────────────────────────────────────
        dict(title="Pre-inspección — Luisa María Torres (Unidad 070)", event_type="postventa_inspection",
             project_id=p1, related_client_id=UUID("c0000000-0000-0000-0000-000000000007"),
             responsible_officer="Beatriz Ortega", event_date=d(4), start_time="09:00", end_time="10:30",
             status="scheduled", location="Residencial Don Memendo — Fase 1, Unidad 070",
             description="Visita de pre-inspección programada. Recorrido completo de la unidad con check-list.",
             notes="Coordinar acceso con jefe de obra."),
        dict(title="Pre-inspección — Fernando Jiménez (Unidad 078)", event_type="postventa_inspection",
             project_id=p1, related_client_id=UUID("c0000000-0000-0000-0000-000000000008"),
             responsible_officer="Héctor Sánchez", event_date=d(7), start_time="14:00", end_time="15:30",
             status="scheduled", location="Residencial Don Memendo — Fase 1, Unidad 078",
             description="Primera inspección. Cliente viajó desde el interior.",
             notes=""),
        dict(title="Revisión correcciones — Miguel Reyes (Unidad 052)", event_type="postventa_inspection",
             project_id=p1, related_client_id=UUID("c0000000-0000-0000-0000-000000000012"),
             responsible_officer="Héctor Sánchez", event_date=d(6), start_time="11:00", end_time="12:00",
             status="scheduled", location="Residencial Don Memendo — Fase 1, Unidad 052",
             description="Verificación de correcciones: pintura techo y paredes. Revisión de puerta principal.",
             notes="Constructor comprometió terminar el 22/06."),
        dict(title="Inspección completada — Verónica Santos (Unidad 041)", event_type="postventa_inspection",
             project_id=p1, related_client_id=UUID("c0000000-0000-0000-0000-000000000011"),
             responsible_officer="Carmen Villalobos", event_date=d(-6), start_time="09:00", end_time="10:30",
             status="completed", location="Residencial Don Memendo — Fase 1, Unidad 041",
             description="Inspección completada. 2 defectos detectados: filtración en balcón y llave de paso.",
             notes="Notificación enviada al constructor el mismo día."),

        # ── Postventa deliveries ───────────────────────────────────────────────
        dict(title="Entrega de unidad — Carmen Díaz (Unidad 035)", event_type="postventa_delivery",
             project_id=p1, related_client_id=UUID("c0000000-0000-0000-0000-000000000005"),
             responsible_officer="Beatriz Ortega", event_date=d(2), start_time="10:00", end_time="11:30",
             status="scheduled", location="Residencial Don Memendo — Fase 1, Unidad 035",
             description="Acto de entrega formal. Firma de acta, entrega de llaves y manual de convivencia.",
             notes="Preparar kit de bienvenida. Gerencia asiste."),
        dict(title="Entrega de unidad — Roberto Sánchez (Unidad 019)", event_type="postventa_delivery",
             project_id=p1, related_client_id=UUID("c0000000-0000-0000-0000-000000000006"),
             responsible_officer="Carmen Villalobos", event_date=d(-30), start_time="10:00", end_time="11:30",
             status="completed", location="Residencial Don Memendo — Fase 1, Unidad 019",
             description="Entrega completada. Garantía 12 meses vigente.",
             notes="Convivencia enviada. Cliente muy satisfecho con el proceso."),

        # ── Comercial visits ───────────────────────────────────────────────────
        dict(title="Recorrido de obra — Raúl Herrera (Lead calificado)", event_type="comercial_visit",
             project_id=p1, related_client_id=None,
             responsible_officer="Paola Jiménez", event_date=d(1), start_time="09:00", end_time="10:00",
             status="scheduled", location="Residencial Don Memendo — Sala de Ventas",
             description="Recorrido personalizado. Pre-aprobado BanReservas RD$3.5M. Alta probabilidad de separación.",
             notes="Llevar renders 3D y plano de planta. Tener formulario de separación listo."),
        dict(title="Visita sala de ventas — Nelson Then & Rosa Bautista", event_type="comercial_visit",
             project_id=p1, related_client_id=None,
             responsible_officer="Ana María Reyes", event_date=d(3), start_time="14:00", end_time="15:30",
             status="scheduled", location="Residencial Don Memendo — Sala de Ventas",
             description="Dos leads calificados visitando juntos. Nelson del sector público. Rosa con doble ingreso familiar.",
             notes="Oportunidad para cerrar 2 unidades en una visita."),
        dict(title="Tour Juan Dolio — James Thompson (inversión USD)", event_type="comercial_visit",
             project_id=p3, related_client_id=None,
             responsible_officer="Ana María Reyes", event_date=d(14), start_time="09:00", end_time="12:00",
             status="scheduled", location="Juan Dolio — Sitio del Proyecto",
             description="Tour completo del proyecto turístico. Cash buyer, Miami. Interesado en vista al mar.",
             notes="Coordinar con gerencia. Preparar pro-forma en USD."),
        dict(title="Seguimiento — Claudia Núñez (recorrido previo)", event_type="comercial_visit",
             project_id=p1, related_client_id=None,
             responsible_officer="Miguel Santana", event_date=d(-3), start_time="11:00", end_time="11:30",
             status="completed", location="Virtual (WhatsApp Video)",
             description="Llamada de seguimiento post-recorrido. Resolvió dudas sobre FONVIVIENDA.",
             notes="Muy interesada. Quiere piso 3+. Próximo paso: separación esta semana."),

        # ── Cobros follow-ups ──────────────────────────────────────────────────
        dict(title="Llamada cobro — José García (vencida D+9)", event_type="cobros_followup",
             project_id=p1, related_client_id=UUID("c0000000-0000-0000-0000-000000000004"),
             responsible_officer="Oficial Cobros 1", event_date=d(0), start_time="10:00", end_time="10:15",
             status="scheduled", location="Llamada telefónica",
             description="Cuota #8 vencida hace 9 días — nivel: gestión. Acordar fecha de pago.",
             notes="Intentar recuperar sin escalar a nivel legal."),
        dict(title="Visita domicilio — Ramón Herrera (vencida D+22)", event_type="cobros_followup",
             project_id=p1, related_client_id=UUID("c0000000-0000-0000-0000-000000000010"),
             responsible_officer="Oficial Cobros 2", event_date=d(1), start_time="09:00", end_time="09:45",
             status="scheduled", location="Domicilio del cliente — Santo Domingo Este",
             description="Cuota vencida D+22 — nivel legal. Visita presencial requerida por protocolo.",
             notes="Llevar carta formal. Reportar resultado a gerencia ese mismo día."),
        dict(title="Llamada cobro — Fernando Jiménez Batista (vencida D+4)", event_type="cobros_followup",
             project_id=p1, related_client_id=UUID("c0000000-0000-0000-0000-000000000008"),
             responsible_officer="Oficial Cobros 1", event_date=d(-1), start_time="15:00", end_time="15:15",
             status="completed", location="Llamada telefónica",
             description="Cuota vencida D+4 — nivel oficial.",
             notes="Cliente prometió pagar el viernes. Seguimiento programado."),

        # ── Internal meetings ──────────────────────────────────────────────────
        dict(title="Reunión semanal de equipo — Todos los departamentos", event_type="internal_meeting",
             project_id=None, related_client_id=None,
             responsible_officer="Gerencia DUPE", event_date=d(0), start_time="08:30", end_time="09:30",
             status="scheduled", location="Sala de Conferencias DUPE",
             description="Revisión de KPIs semanales: cobros, ventas, gestión y postventa. Estado de proyectos.",
             notes="Agenda: (1) Dashboard KPIs, (2) Alertas de morosidad, (3) Pipeline Comercial, (4) Casos Postventa urgentes."),
        dict(title="Revisión de presupuesto Q3 — Finanzas", event_type="internal_meeting",
             project_id=p1, related_client_id=None,
             responsible_officer="Gerencia DUPE", event_date=d(9), start_time="09:00", end_time="11:00",
             status="scheduled", location="Sala de Finanzas",
             description="Análisis de ejecución presupuestal Fase 1 al cierre de junio. Proyección Q3.",
             notes="Traer Excel de ejecución actualizado."),
        dict(title="Comité de ventas — Pipeline Comercial", event_type="internal_meeting",
             project_id=None, related_client_id=None,
             responsible_officer="Gerencia Comercial", event_date=d(7), start_time="14:00", end_time="15:00",
             status="scheduled", location="Sala de Reuniones B",
             description="Revisión de leads calificados, tasa de conversión y proyección de reservas del mes.",
             notes="Incluir proyección de ventas Juan Dolio para Q3."),
        dict(title="Reunión semanal — semana pasada", event_type="internal_meeting",
             project_id=None, related_client_id=None,
             responsible_officer="Gerencia DUPE", event_date=d(-7), start_time="08:30", end_time="09:30",
             status="completed", location="Sala de Conferencias DUPE",
             description="Reunión semanal completada.",
             notes="Acuerdos: aumentar seguimiento leads calificados, revisar caso morosidad Herrera."),
    ]

    for e in events:
        db.add(CalendarEventORM(
            id=uuid4(),
            title=e["title"],
            event_type=e["event_type"],
            project_id=e.get("project_id"),
            related_client_id=e.get("related_client_id"),
            responsible_officer=e["responsible_officer"],
            event_date=e["event_date"],
            start_time=e["start_time"],
            end_time=e.get("end_time"),
            status=e["status"],
            location=e.get("location", ""),
            description=e.get("description", ""),
            notes=e.get("notes", ""),
        ))

    await db.flush()
    logger.info("[SEED] %d calendar events inserted", len(events))
