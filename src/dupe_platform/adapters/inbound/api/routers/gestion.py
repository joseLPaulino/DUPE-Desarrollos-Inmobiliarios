"""
Departamento de Gestión — post-sale client onboarding.

Endpoints
─────────
GET  /gestion/cases                        — list all cases (with filters)
POST /gestion/cases                        — open a new case (manual or from reservation)
GET  /gestion/cases/{case_id}             — case detail
PATCH /gestion/cases/{case_id}/assign      — assign officer (random or named)
PATCH /gestion/cases/{case_id}/documents   — update document checklist
PATCH /gestion/cases/{case_id}/contract    — mark contract generated
PATCH /gestion/cases/{case_id}/appointment — set appointment date/time
PATCH /gestion/cases/{case_id}/fiduciaria  — advance fiduciaria status
GET  /gestion/availability/{officer}       — available appointment slots
"""
from __future__ import annotations

import json
import random
import uuid
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.inbound.api.deps import get_db
from dupe_platform.adapters.outbound.persistence.models import (
    GestionCaseORM, ClientORM, ProjectORM, NotificationORM,
)

router = APIRouter()

OFFICERS = ["Mariela Torres", "Rafael Guzmán", "Yolanda Vargas", "Ernesto Méndez"]
FIDUCIARIA_STATES = ["recoleccion_firma", "enviado_fiduciaria", "cliente_vinculado"]
DOC_STATUSES = {"pendiente", "recibido"}


def _n(v) -> float:
    try: return float(v or 0)
    except Exception: return 0.0


def _elapsed(dt: Optional[datetime]) -> Optional[int]:
    """Days elapsed since a datetime."""
    if not dt:
        return None
    return (datetime.utcnow() - dt.replace(tzinfo=None)).days


def _case_out(c: GestionCaseORM) -> dict:
    history = json.loads(c.fiduciaria_history or "[]")
    docs_complete = all([
        c.doc_cedula == "recibido",
        c.doc_carta_trabajo == "recibido",
        c.doc_movimientos_bancarios == "recibido",
        c.doc_certificacion_vivienda == "recibido",
    ])
    return {
        "id": str(c.id),
        "client_id": str(c.client_id),
        "project_id": str(c.project_id),
        "unit_id": str(c.unit_id) if c.unit_id else None,
        "assigned_officer": c.assigned_officer,
        "assigned_at": c.assigned_at.isoformat() if c.assigned_at else None,
        "documents": {
            "cedula": c.doc_cedula,
            "carta_trabajo": c.doc_carta_trabajo,
            "movimientos_bancarios": c.doc_movimientos_bancarios,
            "certificacion_vivienda": c.doc_certificacion_vivienda,
            "all_received": docs_complete,
        },
        "fiduciaria_status": c.fiduciaria_status,
        "fiduciaria_history": history,
        "fiduciaria_days_elapsed": _elapsed(c.fiduciaria_updated_at),
        "contract_generated": c.contract_generated_at is not None,
        "contract_generated_at": c.contract_generated_at.isoformat() if c.contract_generated_at else None,
        "appointment_date": c.appointment_date.isoformat() if c.appointment_date else None,
        "appointment_time": c.appointment_time,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


# ── List / Create cases ──────────────────────────────────────────────────────

class CaseIn(BaseModel):
    client_id: str
    project_id: str
    unit_id: Optional[str] = None
    notes: str = ""


@router.get("/cases")
async def list_cases(
    project_id: Optional[str] = Query(None),
    officer: Optional[str] = Query(None),
    fiduciaria_status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(GestionCaseORM)
    if project_id:
        q = q.where(GestionCaseORM.project_id == uuid.UUID(project_id))
    if officer:
        q = q.where(GestionCaseORM.assigned_officer == officer)
    if fiduciaria_status:
        q = q.where(GestionCaseORM.fiduciaria_status == fiduciaria_status)
    q = q.order_by(GestionCaseORM.created_at.desc())
    result = await db.execute(q)
    cases = result.scalars().all()

    # Enrich with client name
    enriched = []
    for c in cases:
        client = await db.get(ClientORM, c.client_id)
        row = _case_out(c)
        row["client_name"] = f"{client.first_name} {client.last_name}" if client else "—"
        enriched.append(row)

    return {"cases": enriched, "total": len(enriched)}


@router.post("/cases", status_code=201)
async def create_case(body: CaseIn, db: AsyncSession = Depends(get_db)):
    client = await db.get(ClientORM, uuid.UUID(body.client_id))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Check no duplicate case for same client+project
    r = await db.execute(
        select(GestionCaseORM).where(
            GestionCaseORM.client_id == uuid.UUID(body.client_id),
            GestionCaseORM.project_id == uuid.UUID(body.project_id),
        )
    )
    existing = r.scalars().first()
    if existing:
        raise HTTPException(status_code=409, detail="Gestión case already exists for this client+project")

    # Random officer assignment
    officer = random.choice(OFFICERS)
    now = datetime.utcnow()

    case = GestionCaseORM(
        id=uuid.uuid4(),
        client_id=uuid.UUID(body.client_id),
        project_id=uuid.UUID(body.project_id),
        unit_id=uuid.UUID(body.unit_id) if body.unit_id else None,
        assigned_officer=officer,
        assigned_at=now,
        fiduciaria_status="recoleccion_firma",
        fiduciaria_history=json.dumps([{
            "status": "recoleccion_firma",
            "entered_at": now.isoformat(),
        }]),
        notes=body.notes,
    )
    db.add(case)

    # Notify client: officer name + required documents
    for channel in ("whatsapp", "email"):
        db.add(NotificationORM(
            id=uuid.uuid4(),
            installment_id=uuid.uuid4(),   # placeholder
            client_id=uuid.UUID(body.client_id),
            channel=channel,
            trigger="gestion_asignacion",
            recipient=client.phone_whatsapp if channel == "whatsapp" else client.email,
            template_key="gestion_welcome",
            template_vars=json.dumps({
                "client_name": f"{client.first_name} {client.last_name}",
                "officer_name": officer,
                "docs_required": [
                    "Cédula de identidad",
                    "Carta de trabajo",
                    "Últimos 3 movimientos bancarios",
                    "Certificación de no vivienda",
                ],
            }),
            status="sent",
            sent_at=now,
        ))

    await db.commit()
    await db.refresh(case)
    row = _case_out(case)
    row["client_name"] = f"{client.first_name} {client.last_name}"
    return row


# ── Case detail ───────────────────────────────────────────────────────────────

@router.get("/cases/{case_id}")
async def get_case(case_id: str, db: AsyncSession = Depends(get_db)):
    case = await db.get(GestionCaseORM, uuid.UUID(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    client = await db.get(ClientORM, case.client_id)
    row = _case_out(case)
    row["client_name"] = f"{client.first_name} {client.last_name}" if client else "—"
    return row


# ── Assign officer ────────────────────────────────────────────────────────────

class AssignIn(BaseModel):
    officer_name: Optional[str] = None   # None = random


@router.patch("/cases/{case_id}/assign")
async def assign_officer(case_id: str, body: AssignIn, db: AsyncSession = Depends(get_db)):
    case = await db.get(GestionCaseORM, uuid.UUID(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    case.assigned_officer = body.officer_name or random.choice(OFFICERS)
    case.assigned_at = datetime.utcnow()
    await db.commit()
    return {"case_id": case_id, "assigned_officer": case.assigned_officer}


# ── Update document checklist ─────────────────────────────────────────────────

class DocumentsIn(BaseModel):
    cedula: Optional[str] = None
    carta_trabajo: Optional[str] = None
    movimientos_bancarios: Optional[str] = None
    certificacion_vivienda: Optional[str] = None


@router.patch("/cases/{case_id}/documents")
async def update_documents(case_id: str, body: DocumentsIn, db: AsyncSession = Depends(get_db)):
    case = await db.get(GestionCaseORM, uuid.UUID(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    for field, attr in [
        (body.cedula,                "doc_cedula"),
        (body.carta_trabajo,         "doc_carta_trabajo"),
        (body.movimientos_bancarios, "doc_movimientos_bancarios"),
        (body.certificacion_vivienda,"doc_certificacion_vivienda"),
    ]:
        if field is not None:
            if field not in DOC_STATUSES:
                raise HTTPException(status_code=422, detail=f"Document status must be: {DOC_STATUSES}")
            setattr(case, attr, field)
    await db.commit()
    return _case_out(case)


# ── Contract generation ───────────────────────────────────────────────────────

@router.patch("/cases/{case_id}/contract")
async def generate_contract(case_id: str, db: AsyncSession = Depends(get_db)):
    case = await db.get(GestionCaseORM, uuid.UUID(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    case.contract_generated_at = datetime.utcnow()
    await db.commit()
    return {
        "case_id": case_id,
        "contract_generated_at": case.contract_generated_at.isoformat(),
        "message": "Contrato generado exitosamente. Listo para firma.",
    }


# ── Appointment scheduling ────────────────────────────────────────────────────

class AppointmentIn(BaseModel):
    appointment_date: date
    appointment_time: str    # "HH:MM"


@router.patch("/cases/{case_id}/appointment")
async def set_appointment(case_id: str, body: AppointmentIn, db: AsyncSession = Depends(get_db)):
    case = await db.get(GestionCaseORM, uuid.UUID(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    case.appointment_date = body.appointment_date
    case.appointment_time = body.appointment_time
    await db.commit()

    # Notify client
    client = await db.get(ClientORM, case.client_id)
    if client:
        for channel in ("whatsapp", "email"):
            db.add(NotificationORM(
                id=uuid.uuid4(),
                installment_id=uuid.uuid4(),
                client_id=case.client_id,
                channel=channel,
                trigger="gestion_cita",
                recipient=client.phone_whatsapp if channel == "whatsapp" else client.email,
                template_key="gestion_appointment",
                template_vars=json.dumps({
                    "client_name": f"{client.first_name} {client.last_name}",
                    "officer": case.assigned_officer,
                    "date": body.appointment_date.isoformat(),
                    "time": body.appointment_time,
                }),
                status="sent",
                sent_at=datetime.utcnow(),
            ))
        await db.commit()

    return {
        "case_id": case_id,
        "appointment_date": body.appointment_date.isoformat(),
        "appointment_time": body.appointment_time,
        "notifications_sent": ["whatsapp", "email"],
    }


# ── Fiduciaria status advance ─────────────────────────────────────────────────

class FiduciariaIn(BaseModel):
    status: str
    notes: str = ""


@router.patch("/cases/{case_id}/fiduciaria")
async def advance_fiduciaria(case_id: str, body: FiduciariaIn, db: AsyncSession = Depends(get_db)):
    if body.status not in FIDUCIARIA_STATES:
        raise HTTPException(status_code=422,
            detail=f"status must be one of: {FIDUCIARIA_STATES}")

    case = await db.get(GestionCaseORM, uuid.UUID(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Validate progression (must go forward)
    current_idx = FIDUCIARIA_STATES.index(case.fiduciaria_status)
    new_idx = FIDUCIARIA_STATES.index(body.status)
    if new_idx < current_idx:
        raise HTTPException(status_code=422,
            detail=f"Cannot go back from '{case.fiduciaria_status}' to '{body.status}'")

    now = datetime.utcnow()
    history = json.loads(case.fiduciaria_history or "[]")
    # Close out current state
    if history:
        history[-1]["exited_at"] = now.isoformat()
        history[-1]["days_in_state"] = (
            (now - datetime.fromisoformat(history[-1]["entered_at"])).days
        )
    # Open new state
    history.append({"status": body.status, "entered_at": now.isoformat()})

    case.fiduciaria_status = body.status
    case.fiduciaria_updated_at = now
    case.fiduciaria_history = json.dumps(history)
    if body.notes:
        case.notes = (case.notes + "\n" + body.notes).strip()

    await db.commit()
    return {
        "case_id": case_id,
        "fiduciaria_status": body.status,
        "history": history,
        "days_in_current_state": 0,
    }


# ── Officer availability (simplified — no external calendar) ──────────────────

@router.get("/availability/{officer}")
async def get_availability(officer: str):
    """Returns next 5 weekday slots at 09:00, 11:00, 14:00, 16:00."""
    slots = []
    d = date.today() + timedelta(days=1)
    while len(slots) < 5:
        if d.weekday() < 5:   # Mon–Fri
            for t in ("09:00", "11:00", "14:00", "16:00"):
                slots.append({"date": d.isoformat(), "time": t, "officer": officer})
        d += timedelta(days=1)
    return {"officer": officer, "available_slots": slots[:10]}
