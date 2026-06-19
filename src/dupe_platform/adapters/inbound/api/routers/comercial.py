"""
Departamento Comercial — full sales pipeline.

Endpoints
─────────
GET  /comercial/leads/{project_id}             — list leads (filter by status)
POST /comercial/leads/{project_id}             — create lead (auto-assigns seller round-robin)
PATCH /comercial/leads/{lead_id}/status        — advance lead status
GET  /comercial/inventory/{project_id}         — available units (DISPONIBLE only by default)
PATCH /comercial/inventory/{unit_id}/status    — toggle VENDIDO / DISPONIBLE
POST /comercial/reserve/{project_id}           — reserve unit → create payment plan + notify client
"""
from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.inbound.api.deps import get_db
from dupe_platform.adapters.outbound.persistence.models import (
    LeadORM, UnitORM, ClientORM, PaymentPlanORM, InstallmentORM,
    ProjectORM, NotificationORM,
)

router = APIRouter()

SELLERS = [
    "Ana María Reyes", "Carlos Domínguez", "Paola Jiménez",
    "Miguel Santana", "Laura Fernández",
]
STATUSES = {"nuevo", "contactado", "calificado", "reservado", "descartado"}
SOURCES  = {"facebook", "instagram", "referido", "portal", "evento", "otro"}


def _n(v) -> float:
    try: return float(v or 0)
    except Exception: return 0.0


# ── Lead endpoints ───────────────────────────────────────────────────────────

class LeadIn(BaseModel):
    first_name: str
    last_name: str
    phone: str = ""
    email: str = ""
    source: str = "otro"
    notes: str = ""
    qualification_score: int = 0


class LeadStatusIn(BaseModel):
    status: str
    notes: str = ""


def _lead_out(l: LeadORM) -> dict:
    return {
        "id": str(l.id),
        "project_id": str(l.project_id),
        "first_name": l.first_name,
        "last_name": l.last_name,
        "full_name": f"{l.first_name} {l.last_name}",
        "phone": l.phone,
        "email": l.email,
        "source": l.source,
        "status": l.status,
        "qualification_score": l.qualification_score,
        "assigned_seller": l.assigned_seller,
        "notes": l.notes,
        "created_at": l.created_at.isoformat() if l.created_at else None,
    }


@router.get("/leads/{project_id}")
async def list_leads(
    project_id: str,
    status: Optional[str] = Query(None),
    seller: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(LeadORM).where(LeadORM.project_id == uuid.UUID(project_id))
    if status:
        q = q.where(LeadORM.status == status)
    if seller:
        q = q.where(LeadORM.assigned_seller == seller)
    q = q.order_by(LeadORM.created_at.desc())
    result = await db.execute(q)
    leads = result.scalars().all()

    # Aggregate by status for KPI
    status_counts: dict[str, int] = {}
    for l in leads:
        status_counts[l.status] = status_counts.get(l.status, 0) + 1

    return {
        "leads": [_lead_out(l) for l in leads],
        "total": len(leads),
        "by_status": status_counts,
    }


@router.post("/leads/{project_id}", status_code=201)
async def create_lead(
    project_id: str,
    body: LeadIn,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(ProjectORM, uuid.UUID(project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Round-robin seller assignment based on current lead count
    r = await db.execute(
        select(sqlfunc.count(LeadORM.id)).where(LeadORM.project_id == uuid.UUID(project_id))
    )
    count = r.scalar() or 0
    seller = SELLERS[count % len(SELLERS)]

    lead = LeadORM(
        id=uuid.uuid4(),
        project_id=uuid.UUID(project_id),
        first_name=body.first_name,
        last_name=body.last_name,
        phone=body.phone,
        email=body.email,
        source=body.source if body.source in SOURCES else "otro",
        status="nuevo",
        qualification_score=body.qualification_score,
        assigned_seller=seller,
        notes=body.notes,
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return _lead_out(lead)


@router.patch("/leads/{lead_id}/status")
async def update_lead_status(
    lead_id: str,
    body: LeadStatusIn,
    db: AsyncSession = Depends(get_db),
):
    if body.status not in STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {sorted(STATUSES)}")
    lead = await db.get(LeadORM, uuid.UUID(lead_id))
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead.status = body.status
    if body.notes:
        lead.notes = (lead.notes + "\n" + body.notes).strip()
    await db.commit()
    return _lead_out(lead)


# ── Inventory endpoints ───────────────────────────────────────────────────────

def _unit_out(u: UnitORM) -> dict:
    return {
        "id": str(u.id),
        "project_id": str(u.project_id),
        "unit_number": u.unit_number,
        "floor": u.floor,
        "area_sqm": _n(u.area_sqm),
        "list_price": _n(u.list_price),
        "status": "VENDIDO" if u.is_sold else "DISPONIBLE",
        "is_sold": u.is_sold,
        "client_id": str(u.client_id) if u.client_id else None,
    }


@router.get("/inventory/{project_id}")
async def list_inventory(
    project_id: str,
    available_only: bool = Query(True, description="Show only DISPONIBLE units"),
    db: AsyncSession = Depends(get_db),
):
    q = select(UnitORM).where(UnitORM.project_id == uuid.UUID(project_id))
    if available_only:
        q = q.where(UnitORM.is_sold == False)
    q = q.order_by(UnitORM.floor, UnitORM.unit_number)
    result = await db.execute(q)
    units = result.scalars().all()

    total_q = await db.execute(
        select(sqlfunc.count(UnitORM.id)).where(UnitORM.project_id == uuid.UUID(project_id))
    )
    sold_q = await db.execute(
        select(sqlfunc.count(UnitORM.id)).where(
            UnitORM.project_id == uuid.UUID(project_id),
            UnitORM.is_sold == True,
        )
    )
    total = total_q.scalar() or 0
    sold = sold_q.scalar() or 0

    return {
        "units": [_unit_out(u) for u in units],
        "total_units": total,
        "sold": sold,
        "available": total - sold,
        "absorption_pct": round(sold / total * 100, 1) if total else 0,
    }


@router.patch("/inventory/{unit_id}/status")
async def toggle_unit_status(
    unit_id: str,
    status: str = Query(..., pattern="^(VENDIDO|DISPONIBLE)$"),
    db: AsyncSession = Depends(get_db),
):
    unit = await db.get(UnitORM, uuid.UUID(unit_id))
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    unit.is_sold = (status == "VENDIDO")
    if status == "DISPONIBLE":
        unit.client_id = None
    await db.commit()
    return _unit_out(unit)


# ── Reservation endpoint ──────────────────────────────────────────────────────

class ReservationIn(BaseModel):
    unit_id: str
    client_id: str
    sale_date: date
    total_amount: float
    num_installments: int = 12
    notes: str = ""
    entered_by: str = "Vendedor"


@router.post("/reserve/{project_id}", status_code=201)
async def reserve_unit(
    project_id: str,
    body: ReservationIn,
    db: AsyncSession = Depends(get_db),
):
    """
    Reserve a unit:
    1. Mark unit VENDIDO + assign client
    2. Create payment plan with installments
    3. Simulate WhatsApp + email notification to client
    """
    pid = uuid.UUID(project_id)
    unit_id = uuid.UUID(body.unit_id)
    client_id = uuid.UUID(body.client_id)

    # Validate
    unit = await db.get(UnitORM, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    if unit.is_sold:
        raise HTTPException(status_code=409, detail="Unit already sold")

    client = await db.get(ClientORM, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # 1. Mark unit VENDIDO
    unit.is_sold = True
    unit.client_id = client_id

    # 2. Create payment plan
    from dateutil.relativedelta import relativedelta
    plan = PaymentPlanORM(
        id=uuid.uuid4(),
        client_id=client_id,
        unit_id=unit_id,
        project_id=pid,
        sale_date=body.sale_date,
        total_amount=Decimal(str(body.total_amount)),
        is_active=True,
        approved_by=body.entered_by,
        notes=body.notes,
    )
    db.add(plan)

    # 3. Generate installments
    per_installment = Decimal(str(round(body.total_amount / body.num_installments, 2)))
    remainder = Decimal(str(body.total_amount)) - per_installment * body.num_installments
    for i in range(1, body.num_installments + 1):
        amount = per_installment + (remainder if i == body.num_installments else Decimal("0"))
        due_date = body.sale_date + relativedelta(months=i)
        db.add(InstallmentORM(
            id=uuid.uuid4(),
            plan_id=plan.id,
            installment_number=i,
            due_date=due_date,
            amount=amount,
            status="pending",
        ))

    # 4. Simulate notification
    for channel in ("whatsapp", "email"):
        db.add(NotificationORM(
            id=uuid.uuid4(),
            installment_id=plan.installments[0].id if hasattr(plan, '_sa_instance_state') else uuid.uuid4(),
            client_id=client_id,
            channel=channel,
            trigger="reserva_unidad",
            recipient=client.phone_whatsapp if channel == "whatsapp" else client.email,
            template_key="reservation_payment_plan",
            template_vars=json.dumps({
                "client_name": f"{client.first_name} {client.last_name}",
                "unit": unit.unit_number,
                "total": str(body.total_amount),
                "installments": body.num_installments,
            }),
            status="sent",
            sent_at=datetime.utcnow(),
        ))

    await db.commit()

    return {
        "plan_id": str(plan.id),
        "unit_id": body.unit_id,
        "client_id": body.client_id,
        "unit_number": unit.unit_number,
        "client_name": f"{client.first_name} {client.last_name}",
        "total_amount": body.total_amount,
        "num_installments": body.num_installments,
        "status": "reserved",
        "notifications_sent": ["whatsapp", "email"],
    }
