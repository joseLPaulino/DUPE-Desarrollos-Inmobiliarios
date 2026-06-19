"""
Departamento: Business Calendar
Endpoints: list, create, update status, delete
"""
from __future__ import annotations
from datetime import date
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.outbound.persistence.database import get_db
from dupe_platform.adapters.outbound.persistence.models import CalendarEventORM

router = APIRouter()

EVENT_TYPES = [
    "gestion_appointment",
    "postventa_inspection",
    "postventa_delivery",
    "comercial_visit",
    "cobros_followup",
    "internal_meeting",
    "other",
]
STATUSES = ["scheduled", "completed", "cancelled", "rescheduled"]


# ── Schemas ──────────────────────────────────────────────────────────────────

class CalendarEventIn(BaseModel):
    title: str
    description: str = ""
    event_type: str
    project_id: Optional[str] = None
    related_case_id: Optional[str] = None
    related_client_id: Optional[str] = None
    responsible_officer: str = ""
    event_date: date
    start_time: str = "09:00"
    end_time: Optional[str] = None
    status: str = "scheduled"
    location: str = ""
    notes: str = ""


class CalendarEventStatusIn(BaseModel):
    status: str
    notes: Optional[str] = None


def _event_out(ev: CalendarEventORM) -> dict:
    return {
        "id": str(ev.id),
        "title": ev.title,
        "description": ev.description,
        "event_type": ev.event_type,
        "project_id": str(ev.project_id) if ev.project_id else None,
        "related_case_id": ev.related_case_id,
        "related_client_id": str(ev.related_client_id) if ev.related_client_id else None,
        "responsible_officer": ev.responsible_officer,
        "event_date": ev.event_date.isoformat(),
        "start_time": ev.start_time,
        "end_time": ev.end_time,
        "status": ev.status,
        "location": ev.location,
        "notes": ev.notes,
        "created_at": ev.created_at.isoformat() if ev.created_at else None,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_events(
    from_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    to_date: Optional[date] = Query(None, description="End date (inclusive)"),
    event_type: Optional[str] = Query(None),
    officer: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List calendar events with optional filters."""
    q = select(CalendarEventORM)
    filters = []
    if from_date:
        filters.append(CalendarEventORM.event_date >= from_date)
    if to_date:
        filters.append(CalendarEventORM.event_date <= to_date)
    if event_type:
        filters.append(CalendarEventORM.event_type == event_type)
    if officer:
        filters.append(CalendarEventORM.responsible_officer.ilike(f"%{officer}%"))
    if project_id:
        filters.append(CalendarEventORM.project_id == UUID(project_id))
    if status:
        filters.append(CalendarEventORM.status == status)
    if filters:
        q = q.where(and_(*filters))
    q = q.order_by(CalendarEventORM.event_date, CalendarEventORM.start_time)

    result = await db.execute(q)
    events = result.scalars().all()

    # Group by date for calendar rendering
    by_date: dict[str, list] = {}
    for ev in events:
        key = ev.event_date.isoformat()
        by_date.setdefault(key, []).append(_event_out(ev))

    return {
        "events": [_event_out(ev) for ev in events],
        "by_date": by_date,
        "total": len(events),
        "event_types": EVENT_TYPES,
    }


@router.post("")
async def create_event(
    payload: CalendarEventIn,
    db: AsyncSession = Depends(get_db),
):
    """Create a new calendar event."""
    if payload.event_type not in EVENT_TYPES:
        raise HTTPException(400, f"event_type must be one of: {EVENT_TYPES}")
    if payload.status not in STATUSES:
        raise HTTPException(400, f"status must be one of: {STATUSES}")

    ev = CalendarEventORM(
        id=uuid4(),
        title=payload.title,
        description=payload.description,
        event_type=payload.event_type,
        project_id=UUID(payload.project_id) if payload.project_id else None,
        related_case_id=payload.related_case_id,
        related_client_id=UUID(payload.related_client_id) if payload.related_client_id else None,
        responsible_officer=payload.responsible_officer,
        event_date=payload.event_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        status=payload.status,
        location=payload.location,
        notes=payload.notes,
    )
    db.add(ev)
    await db.flush()
    await db.commit()
    return _event_out(ev)


@router.get("/{event_id}")
async def get_event(event_id: str, db: AsyncSession = Depends(get_db)):
    ev = await db.get(CalendarEventORM, UUID(event_id))
    if not ev:
        raise HTTPException(404, "Event not found")
    return _event_out(ev)


@router.patch("/{event_id}/status")
async def update_event_status(
    event_id: str,
    payload: CalendarEventStatusIn,
    db: AsyncSession = Depends(get_db),
):
    """Update event status (scheduled → completed / cancelled / rescheduled)."""
    if payload.status not in STATUSES:
        raise HTTPException(400, f"status must be one of: {STATUSES}")
    ev = await db.get(CalendarEventORM, UUID(event_id))
    if not ev:
        raise HTTPException(404, "Event not found")
    ev.status = payload.status
    if payload.notes:
        ev.notes = (ev.notes + f"\n[{payload.status.upper()}] {payload.notes}").strip()
    await db.flush()
    await db.commit()
    return _event_out(ev)


@router.patch("/{event_id}")
async def update_event(
    event_id: str,
    payload: CalendarEventIn,
    db: AsyncSession = Depends(get_db),
):
    """Full update of an event (reschedule, change details)."""
    ev = await db.get(CalendarEventORM, UUID(event_id))
    if not ev:
        raise HTTPException(404, "Event not found")
    ev.title = payload.title
    ev.description = payload.description
    ev.event_type = payload.event_type
    ev.project_id = UUID(payload.project_id) if payload.project_id else None
    ev.related_case_id = payload.related_case_id
    ev.related_client_id = UUID(payload.related_client_id) if payload.related_client_id else None
    ev.responsible_officer = payload.responsible_officer
    ev.event_date = payload.event_date
    ev.start_time = payload.start_time
    ev.end_time = payload.end_time
    ev.status = payload.status
    ev.location = payload.location
    ev.notes = payload.notes
    await db.flush()
    await db.commit()
    return _event_out(ev)


@router.delete("/{event_id}")
async def delete_event(event_id: str, db: AsyncSession = Depends(get_db)):
    ev = await db.get(CalendarEventORM, UUID(event_id))
    if not ev:
        raise HTTPException(404, "Event not found")
    await db.delete(ev)
    await db.commit()
    return {"deleted": event_id}
