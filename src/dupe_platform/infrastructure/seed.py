"""
Synthetic data seeder — populates DB with realistic DUPE demo data.
Run on startup when LOAD_SYNTHETIC_DATA=true.
Idempotent: skips if data already exists.
"""
from __future__ import annotations
import logging
from datetime import date
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.outbound.persistence.models import (
    ProjectORM, UnitORM, ClientORM, PaymentPlanORM, InstallmentORM,
    BudgetORM, PartidaORM, PartidaExecutionORM,
)

logger = logging.getLogger("dupe.seed")

# ── Synthetic project data ─────────────────────────────────────────────────────
PROJECTS = [
    {
        "id": "a1b2c3d4-0000-0000-0000-000000000001",
        "name": "Residencial Las Palmas — Fase I",
        "project_type": "social_interest",
        "status": "construction",
        "start_date": date(2023, 6, 1),
        "expected_delivery_date": date(2025, 12, 31),
        "total_units": 120,
        "currency": "DOP",
        "total_budget": Decimal("185000000.00"),
        "physical_progress_pct": Decimal("62.5"),
    },
    {
        "id": "a1b2c3d4-0000-0000-0000-000000000002",
        "name": "Villas del Mar — Torre A",
        "project_type": "social_interest",
        "status": "construction",
        "start_date": date(2024, 1, 15),
        "expected_delivery_date": date(2026, 6, 30),
        "total_units": 80,
        "currency": "DOP",
        "total_budget": Decimal("120000000.00"),
        "physical_progress_pct": Decimal("28.0"),
    },
]

# ── Synthetic budget partidas ──────────────────────────────────────────────────
PARTIDAS = [
    # Expenses
    {"code": "GASTO-001", "name": "Construcción y Obra Civil",   "type": "expense", "budget": Decimal("85000000.00"), "executed": Decimal("54250000.00")},
    {"code": "GASTO-002", "name": "Materiales y Equipos",        "type": "expense", "budget": Decimal("30000000.00"), "executed": Decimal("27800000.00")},
    {"code": "GASTO-003", "name": "Mano de Obra / Salarios",     "type": "expense", "budget": Decimal("18000000.00"), "executed": Decimal("11200000.00")},
    {"code": "GASTO-004", "name": "Honorarios Profesionales",    "type": "expense", "budget": Decimal("8500000.00"),  "executed": Decimal("9100000.00")},  # OVER budget → RED
    {"code": "GASTO-005", "name": "Permisos y Gastos Legales",   "type": "expense", "budget": Decimal("3200000.00"),  "executed": Decimal("2100000.00")},
    {"code": "GASTO-006", "name": "Gastos Financieros",          "type": "expense", "budget": Decimal("12000000.00"), "executed": Decimal("10800000.00")},  # AMBER
    {"code": "GASTO-007", "name": "Imprevistos y Contingencias", "type": "expense", "budget": Decimal("5000000.00"),  "executed": Decimal("1850000.00")},
    # Income
    {"code": "INGRESO-001", "name": "Cuotas de Clientes",        "type": "income",  "budget": Decimal("145000000.00"),"executed": Decimal("87500000.00")},
    {"code": "INGRESO-002", "name": "Préstamo Bancario BHD",     "type": "income",  "budget": Decimal("40000000.00"), "executed": Decimal("40000000.00")},
]

# ── Synthetic clients ──────────────────────────────────────────────────────────
CLIENTS = [
    {"id": "c0000000-0000-0000-0000-000000000001", "first_name": "María",     "last_name": "Rodríguez",   "id_number": "001-1234567-8", "phone_whatsapp": "+18091234001", "email": "m.rodriguez@email.com"},
    {"id": "c0000000-0000-0000-0000-000000000002", "first_name": "Carlos",    "last_name": "Martínez",    "id_number": "001-2345678-9", "phone_whatsapp": "+18092234002", "email": "c.martinez@email.com"},
    {"id": "c0000000-0000-0000-0000-000000000003", "first_name": "Ana",       "last_name": "Pérez",       "id_number": "001-3456789-0", "phone_whatsapp": "+18093234003", "email": "a.perez@email.com"},
    {"id": "c0000000-0000-0000-0000-000000000004", "first_name": "José",      "last_name": "García",      "id_number": "001-4567890-1", "phone_whatsapp": "+18094234004", "email": "j.garcia@email.com"},
    {"id": "c0000000-0000-0000-0000-000000000005", "first_name": "Carmen",    "last_name": "Díaz",        "id_number": "001-5678901-2", "phone_whatsapp": "+18095234005", "email": "c.diaz@email.com"},
    {"id": "c0000000-0000-0000-0000-000000000006", "first_name": "Roberto",   "last_name": "Sánchez",     "id_number": "001-6789012-3", "phone_whatsapp": "+18096234006", "email": "r.sanchez@email.com"},
    {"id": "c0000000-0000-0000-0000-000000000007", "first_name": "Luisa",     "last_name": "Torres",      "id_number": "001-7890123-4", "phone_whatsapp": "+18097234007", "email": "l.torres@email.com"},
    {"id": "c0000000-0000-0000-0000-000000000008", "first_name": "Fernando",  "last_name": "Jiménez",     "id_number": "001-8901234-5", "phone_whatsapp": "+18098234008", "email": "f.jimenez@email.com"},
]


async def seed_synthetic_data(db: AsyncSession) -> None:
    # Idempotency check
    existing = await db.scalar(select(ProjectORM).limit(1))
    if existing:
        logger.info("[SEED] Data already exists — skipping")
        return

    logger.info("[SEED] Loading synthetic data...")
    from uuid import UUID
    from datetime import timedelta

    for proj_data in PROJECTS:
        proj = ProjectORM(**proj_data)
        db.add(proj)
        await db.flush()

        # Units (10 per project for demo)
        unit_ids = []
        for u in range(1, 11):
            unit = UnitORM(
                id=uuid4(),
                project_id=proj.id,
                unit_number=f"{proj.total_units // 10 * u:03d}",
                floor=(u - 1) // 4 + 1,
                area_sqm=Decimal("65.00") + Decimal(str(u * 2)),
                list_price=Decimal("1850000.00") + Decimal(str(u * 50000)),
                is_sold=u <= 8,
            )
            db.add(unit)
            unit_ids.append(unit.id)
        await db.flush()

        # Budget
        budget = BudgetORM(id=uuid4(), project_id=proj.id, version=1, approved_date=proj.start_date)
        db.add(budget)
        await db.flush()

        partida_map = {}
        for p in PARTIDAS:
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
            partida_map[p["code"]] = partida.id

            # Execution entries
            if p["executed"] > 0:
                exec_entry = PartidaExecutionORM(
                    id=uuid4(),
                    budget_id=budget.id,
                    partida_id=partida.id,
                    project_id=proj.id,
                    amount=p["executed"],
                    execution_date=date.today() - timedelta(days=30),
                    description=f"Ejecución acumulada — {p['name']}",
                    entered_by="seed",
                )
                db.add(exec_entry)

    await db.flush()

    # Clients
    for cl_data in CLIENTS:
        cl = ClientORM(
            id=UUID(cl_data["id"]),
            first_name=cl_data["first_name"],
            last_name=cl_data["last_name"],
            id_number=cl_data["id_number"],
            phone_whatsapp=cl_data["phone_whatsapp"],
            email=cl_data["email"],
        )
        db.add(cl)

    await db.flush()

    # Payment plans — 6 clients with plans on project 1
    from dateutil.relativedelta import relativedelta
    project_1_id = UUID(PROJECTS[0]["id"])
    units = await db.scalars(select(UnitORM).where(UnitORM.project_id == project_1_id).limit(6))
    unit_list = list(units)

    today = date.today()
    sale_configs = [
        (UUID(CLIENTS[0]["id"]), 12, today - timedelta(days=180), 0),    # 6 months in, no overdue
        (UUID(CLIENTS[1]["id"]), 12, today - timedelta(days=90),  0),    # 3 months in
        (UUID(CLIENTS[2]["id"]), 10, today - timedelta(days=120), 2),    # 2 overdue (D+1 scenario)
        (UUID(CLIENTS[3]["id"]), 12, today - timedelta(days=150), 1),    # 1 overdue (D+6 scenario)
        (UUID(CLIENTS[4]["id"]), 8,  today - timedelta(days=200), 3),    # 3 overdue (D+16 scenario)
        (UUID(CLIENTS[5]["id"]), 12, today - timedelta(days=60),  0),    # recent, no overdue
    ]

    for idx, (client_id, num_inst, sale_date, num_overdue) in enumerate(sale_configs):
        if idx >= len(unit_list):
            break
        unit = unit_list[idx]
        plan_id = uuid4()
        sale_price = unit.list_price
        inst_amount = (sale_price / num_inst).quantize(Decimal("0.01"))

        plan = PaymentPlanORM(
            id=plan_id,
            client_id=client_id,
            unit_id=unit.id,
            project_id=project_1_id,
            sale_date=sale_date,
            total_amount=sale_price,
            is_active=True,
            approved_by="gerencia",
        )
        db.add(plan)
        await db.flush()

        for i in range(num_inst):
            due = sale_date + relativedelta(months=i + 1)
            overdue_days = max(0, (today - due).days) if due < today else 0
            is_overdue_installment = (num_inst - num_overdue <= i < num_inst and overdue_days > 0)

            if due < today and not is_overdue_installment:
                status = "paid"
                paid_date = due + timedelta(days=2)
                paid_amount = inst_amount
                days_ov = 0
                esc = "none"
            elif is_overdue_installment:
                status = "overdue"
                paid_date = None
                paid_amount = None
                days_ov = overdue_days
                esc = "legal" if days_ov >= 16 else "management" if days_ov >= 6 else "officer"
            else:
                status = "pending"
                paid_date = None
                paid_amount = None
                days_ov = 0
                esc = "none"

            inst = InstallmentORM(
                id=uuid4(),
                plan_id=plan_id,
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

    await db.commit()
    logger.info("[SEED] Synthetic data loaded successfully")
