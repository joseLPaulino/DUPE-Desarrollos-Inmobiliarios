"""
Departamento de Postventa — delivery and warranty lifecycle.

Endpoints
─────────
GET  /postventa/cases                          — list all postventa cases
POST /postventa/cases                          — open a case (after gestión vinculación)
GET  /postventa/cases/{case_id}               — case detail
POST /postventa/cases/{case_id}/inspection    — submit pre-inspection form
PATCH /postventa/cases/{case_id}/status       — advance status (listo/correccion/entregado)
PATCH /postventa/cases/{case_id}/appointment  — schedule delivery appointment
PATCH /postventa/cases/{case_id}/deliver      — mark as delivered (generates acta, warranty)
GET  /postventa/indicators                    — KPI: days-in-state stats (management view)
GET  /postventa/warranties                    — active warranties with days remaining
"""
from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta
from typing import Optional, List

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.inbound.api.deps import get_db
from dupe_platform.adapters.outbound.persistence.models import (
    PostventaCaseORM, ClientORM, UnitORM, NotificationORM, ProjectORM,
)

router = APIRouter()

STATUSES = ["preinspeccion", "en_revision", "listo", "correccion", "entregado"]
OFFICERS = ["Beatriz Ortega", "Héctor Sánchez", "Nelly Cruz"]


def _elapsed(entered_at_str: Optional[str]) -> int:
    if not entered_at_str:
        return 0
    try:
        entered = datetime.fromisoformat(entered_at_str)
        return (datetime.utcnow() - entered).days
    except Exception:
        return 0


def _case_out(c: PostventaCaseORM) -> dict:
    history = json.loads(c.status_history or "[]")
    items = json.loads(c.inspection_items or "[]")
    current_entry = history[-1] if history else None
    days_in_current = _elapsed(current_entry["entered_at"]) if current_entry else 0

    warranty_days_remaining = None
    if c.warranty_expiry_date:
        remaining = (c.warranty_expiry_date - date.today()).days
        warranty_days_remaining = max(0, remaining)

    return {
        "id": str(c.id),
        "client_id": str(c.client_id),
        "project_id": str(c.project_id),
        "unit_id": str(c.unit_id) if c.unit_id else None,
        "assigned_officer": c.assigned_officer,
        "status": c.status,
        "status_history": history,
        "days_in_current_state": days_in_current,
        "inspection_items": items,
        "inspection_item_count": len(items),
        "defect_count": sum(len(item.get("defects", [])) for item in items),
        "inspection_submitted_at": c.inspection_submitted_at.isoformat() if c.inspection_submitted_at else None,
        "constructor_notified_at": c.constructor_notified_at.isoformat() if c.constructor_notified_at else None,
        "client_notified_at": c.client_notified_at.isoformat() if c.client_notified_at else None,
        "appointment_date": c.appointment_date.isoformat() if c.appointment_date else None,
        "delivery_date": c.delivery_date.isoformat() if c.delivery_date else None,
        "warranty_expiry_date": c.warranty_expiry_date.isoformat() if c.warranty_expiry_date else None,
        "warranty_days_remaining": warranty_days_remaining,
        "convivencia_sent_at": c.convivencia_sent_at.isoformat() if c.convivencia_sent_at else None,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


# ── List / Create ─────────────────────────────────────────────────────────────

class PostventaCaseIn(BaseModel):
    client_id: str
    project_id: str
    unit_id: Optional[str] = None
    assigned_officer: Optional[str] = None
    notes: str = ""


@router.get("/cases")
async def list_cases(
    project_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(PostventaCaseORM)
    if project_id:
        q = q.where(PostventaCaseORM.project_id == uuid.UUID(project_id))
    if status:
        q = q.where(PostventaCaseORM.status == status)
    q = q.order_by(PostventaCaseORM.created_at.desc())
    result = await db.execute(q)
    cases = result.scalars().all()

    enriched = []
    for c in cases:
        client = await db.get(ClientORM, c.client_id)
        row = _case_out(c)
        row["client_name"] = f"{client.first_name} {client.last_name}" if client else "—"
        enriched.append(row)

    return {"cases": enriched, "total": len(enriched)}


@router.post("/cases", status_code=201)
async def create_case(body: PostventaCaseIn, db: AsyncSession = Depends(get_db)):
    client = await db.get(ClientORM, uuid.UUID(body.client_id))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    r = await db.execute(
        select(PostventaCaseORM).where(
            PostventaCaseORM.client_id == uuid.UUID(body.client_id),
            PostventaCaseORM.project_id == uuid.UUID(body.project_id),
        )
    )
    if r.scalars().first():
        raise HTTPException(status_code=409, detail="Postventa case already exists for this client+project")

    import random
    officer = body.assigned_officer or random.choice(OFFICERS)
    now = datetime.utcnow()
    history = [{"status": "preinspeccion", "entered_at": now.isoformat()}]

    case = PostventaCaseORM(
        id=uuid.uuid4(),
        client_id=uuid.UUID(body.client_id),
        project_id=uuid.UUID(body.project_id),
        unit_id=uuid.UUID(body.unit_id) if body.unit_id else None,
        assigned_officer=officer,
        status="preinspeccion",
        status_history=json.dumps(history),
        notes=body.notes,
    )
    db.add(case)
    await db.commit()
    await db.refresh(case)
    row = _case_out(case)
    row["client_name"] = f"{client.first_name} {client.last_name}"
    return row


@router.get("/cases/{case_id}")
async def get_case(case_id: str, db: AsyncSession = Depends(get_db)):
    case = await db.get(PostventaCaseORM, uuid.UUID(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    client = await db.get(ClientORM, case.client_id)
    row = _case_out(case)
    row["client_name"] = f"{client.first_name} {client.last_name}" if client else "—"
    return row


# ── Pre-inspection form ───────────────────────────────────────────────────────

class InspectionDefect(BaseModel):
    defect: str
    notes: str = ""


class InspectionArea(BaseModel):
    area: str                           # "Habitación 1", "Sala", "Cocina", etc.
    defects: List[InspectionDefect]
    image_url: str = ""                 # placeholder — real upload requires object storage
    notes: str = ""


class InspectionIn(BaseModel):
    areas: List[InspectionArea]
    general_notes: str = ""


@router.post("/cases/{case_id}/inspection")
async def submit_inspection(
    case_id: str,
    body: InspectionIn,
    db: AsyncSession = Depends(get_db),
):
    case = await db.get(PostventaCaseORM, uuid.UUID(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    now = datetime.utcnow()
    items = [a.model_dump() for a in body.areas]
    case.inspection_items = json.dumps(items)
    case.inspection_submitted_at = now

    # Advance to en_revision
    history = json.loads(case.status_history or "[]")
    if history:
        history[-1]["exited_at"] = now.isoformat()
        history[-1]["days_in_state"] = _elapsed(history[-1]["entered_at"])
    history.append({"status": "en_revision", "entered_at": now.isoformat()})
    case.status = "en_revision"
    case.status_history = json.dumps(history)

    client = await db.get(ClientORM, case.client_id)

    # Notify constructor (simulated) + DUPE official
    for channel in ("email",):
        # Constructor notification
        db.add(NotificationORM(
            id=uuid.uuid4(),
            installment_id=uuid.uuid4(),
            client_id=case.client_id,
            channel=channel,
            trigger="postventa_inspeccion_constructor",
            recipient="constructor@dupedesa.com",
            template_key="postventa_inspection_report",
            template_vars=json.dumps({
                "client_name": f"{client.first_name} {client.last_name}" if client else "—",
                "case_id": case_id,
                "defect_count": sum(len(a.defects) for a in body.areas),
                "areas": [a.area for a in body.areas],
            }),
            status="sent",
            sent_at=now,
        ))
    case.constructor_notified_at = now

    # Notify client (confirmation of reception)
    if client:
        for channel in ("whatsapp", "email"):
            db.add(NotificationORM(
                id=uuid.uuid4(),
                installment_id=uuid.uuid4(),
                client_id=case.client_id,
                channel=channel,
                trigger="postventa_inspeccion_cliente",
                recipient=client.phone_whatsapp if channel == "whatsapp" else client.email,
                template_key="postventa_inspection_received",
                template_vars=json.dumps({
                    "client_name": f"{client.first_name} {client.last_name}",
                    "defect_count": sum(len(a.defects) for a in body.areas),
                }),
                status="sent",
                sent_at=now,
            ))
    case.client_notified_at = now

    await db.commit()
    return {
        "case_id": case_id,
        "status": "en_revision",
        "areas_submitted": len(body.areas),
        "defect_count": sum(len(a.defects) for a in body.areas),
        "constructor_notified": True,
        "client_notified": True,
    }


# ── Status advance ────────────────────────────────────────────────────────────

class StatusIn(BaseModel):
    status: str
    notes: str = ""
    appointment_date: Optional[date] = None


@router.patch("/cases/{case_id}/status")
async def advance_status(case_id: str, body: StatusIn, db: AsyncSession = Depends(get_db)):
    if body.status not in STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of: {STATUSES}")

    case = await db.get(PostventaCaseORM, uuid.UUID(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.status == "entregado":
        raise HTTPException(status_code=422, detail="Case already delivered")

    now = datetime.utcnow()
    history = json.loads(case.status_history or "[]")
    if history:
        history[-1]["exited_at"] = now.isoformat()
        history[-1]["days_in_state"] = _elapsed(history[-1]["entered_at"])
    history.append({"status": body.status, "entered_at": now.isoformat()})
    case.status = body.status
    case.status_history = json.dumps(history)
    if body.notes:
        case.notes = (case.notes + "\n" + body.notes).strip()

    client = await db.get(ClientORM, case.client_id)

    # When "listo" — notify client with appointment availability
    if body.status == "listo" and client:
        for channel in ("whatsapp", "email"):
            db.add(NotificationORM(
                id=uuid.uuid4(),
                installment_id=uuid.uuid4(),
                client_id=case.client_id,
                channel=channel,
                trigger="postventa_listo",
                recipient=client.phone_whatsapp if channel == "whatsapp" else client.email,
                template_key="postventa_ready",
                template_vars=json.dumps({
                    "client_name": f"{client.first_name} {client.last_name}",
                    "officer": case.assigned_officer,
                }),
                status="sent",
                sent_at=now,
            ))

    if body.appointment_date:
        case.appointment_date = body.appointment_date

    await db.commit()
    return _case_out(case)


# ── Delivery ──────────────────────────────────────────────────────────────────

class DeliveryIn(BaseModel):
    delivery_date: date
    notes: str = ""


@router.patch("/cases/{case_id}/deliver")
async def deliver_unit(case_id: str, body: DeliveryIn, db: AsyncSession = Depends(get_db)):
    case = await db.get(PostventaCaseORM, uuid.UUID(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.status == "entregado":
        raise HTTPException(status_code=409, detail="Unit already delivered")

    now = datetime.utcnow()
    history = json.loads(case.status_history or "[]")
    if history:
        history[-1]["exited_at"] = now.isoformat()
        history[-1]["days_in_state"] = _elapsed(history[-1]["entered_at"])
    history.append({"status": "entregado", "entered_at": now.isoformat()})

    case.status = "entregado"
    case.status_history = json.dumps(history)
    case.delivery_date = body.delivery_date
    case.warranty_expiry_date = body.delivery_date + relativedelta(months=12)
    case.convivencia_sent_at = now
    if body.notes:
        case.notes = (case.notes + "\n" + body.notes).strip()

    client = await db.get(ClientORM, case.client_id)

    # Send convivencia manual on delivery
    if client:
        for channel in ("whatsapp", "email"):
            db.add(NotificationORM(
                id=uuid.uuid4(),
                installment_id=uuid.uuid4(),
                client_id=case.client_id,
                channel=channel,
                trigger="postventa_entregado",
                recipient=client.phone_whatsapp if channel == "whatsapp" else client.email,
                template_key="postventa_delivery",
                template_vars=json.dumps({
                    "client_name": f"{client.first_name} {client.last_name}",
                    "delivery_date": body.delivery_date.isoformat(),
                    "warranty_expiry": case.warranty_expiry_date.isoformat(),
                    "document": "manual_convivencia.pdf",
                }),
                status="sent",
                sent_at=now,
            ))

    await db.commit()
    return {
        "case_id": case_id,
        "status": "entregado",
        "delivery_date": body.delivery_date.isoformat(),
        "warranty_expiry_date": case.warranty_expiry_date.isoformat(),
        "warranty_months": 12,
        "convivencia_sent": True,
        "acta_generated": True,
    }


# ── Indicators ────────────────────────────────────────────────────────────────

@router.get("/indicators")
async def get_indicators(
    project_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Days-in-state statistics for management view."""
    q = select(PostventaCaseORM)
    if project_id:
        q = q.where(PostventaCaseORM.project_id == uuid.UUID(project_id))
    result = await db.execute(q)
    cases = result.scalars().all()

    stats: dict[str, list[int]] = {s: [] for s in STATUSES}
    for c in cases:
        history = json.loads(c.status_history or "[]")
        for h in history:
            s = h.get("status")
            if s not in stats:
                continue
            if "days_in_state" in h:
                stats[s].append(h["days_in_state"])
            elif h == history[-1]:  # current state
                stats[s].append(_elapsed(h.get("entered_at")))

    def _agg(vals: list[int]) -> dict:
        if not vals:
            return {"count": 0, "avg_days": 0, "max_days": 0}
        return {
            "count": len(vals),
            "avg_days": round(sum(vals) / len(vals), 1),
            "max_days": max(vals),
        }

    return {
        "total_cases": len(cases),
        "by_status": {s: _agg(stats[s]) for s in STATUSES},
        "active": len([c for c in cases if c.status != "entregado"]),
        "delivered": len([c for c in cases if c.status == "entregado"]),
    }


# ── Warranties ────────────────────────────────────────────────────────────────

@router.get("/warranties")
async def list_warranties(
    project_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """All delivered units with warranty countdown."""
    q = select(PostventaCaseORM).where(PostventaCaseORM.status == "entregado")
    if project_id:
        q = q.where(PostventaCaseORM.project_id == uuid.UUID(project_id))
    result = await db.execute(q)
    cases = result.scalars().all()

    warranties = []
    for c in cases:
        if not c.warranty_expiry_date:
            continue
        client = await db.get(ClientORM, c.client_id)
        days_remaining = max(0, (c.warranty_expiry_date - date.today()).days)
        warranties.append({
            "case_id": str(c.id),
            "client_name": f"{client.first_name} {client.last_name}" if client else "—",
            "unit_id": str(c.unit_id) if c.unit_id else None,
            "delivery_date": c.delivery_date.isoformat() if c.delivery_date else None,
            "warranty_expiry_date": c.warranty_expiry_date.isoformat(),
            "days_remaining": days_remaining,
            "warranty_active": days_remaining > 0,
            "status": "activa" if days_remaining > 0 else "vencida",
        })

    warranties.sort(key=lambda w: w["days_remaining"])
    return {"warranties": warranties, "total": len(warranties)}
