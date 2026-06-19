"""Provenance — plan activity timeline and legal letters router."""
from __future__ import annotations
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.outbound.persistence.database import get_db
from dupe_platform.adapters.outbound.persistence.models import (
    PlanActivityORM, LegalLetterORM,
)

router = APIRouter()


# ── Activity Timeline ──────────────────────────────────────────────────────────

@router.get("/plan-activity/{plan_id}")
async def get_plan_activity(
    plan_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Full chronological activity timeline for a payment plan.
    Returns all PlanActivityORM entries ordered oldest → newest.
    """
    result = await db.execute(
        select(PlanActivityORM)
        .where(PlanActivityORM.plan_id == plan_id)
        .order_by(PlanActivityORM.created_at.asc())
    )
    entries = result.scalars().all()

    return [
        {
            "id": str(e.id),
            "plan_id": str(e.plan_id),
            "action_type": e.action_type,
            "channel": e.channel,
            "actor": e.actor,
            "description": e.description,
            "metadata": e.metadata_json,
            "related_entity_id": e.related_entity_id,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]


# ── Legal Letters ──────────────────────────────────────────────────────────────

class UpdateLetterStatusRequest(BaseModel):
    status: str  # generated | reviewed | signed | sent | delivered | voided
    signed_by: Optional[str] = None
    notes: Optional[str] = None


@router.get("/legal-letters/{plan_id}")
async def get_legal_letters(
    plan_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    All legal demand letters generated for a payment plan.
    Ordered newest first.
    """
    result = await db.execute(
        select(LegalLetterORM)
        .where(LegalLetterORM.plan_id == plan_id)
        .order_by(LegalLetterORM.generated_at.desc())
    )
    letters = result.scalars().all()

    return [
        {
            "id": str(l.id),
            "plan_id": str(l.plan_id),
            "client_id": str(l.client_id) if l.client_id else None,
            "project_id": str(l.project_id) if l.project_id else None,
            "unit_number": l.unit_number,
            "status": l.status,
            "letter_text": l.letter_text,
            "overdue_installments": l.overdue_installments,
            "total_overdue_amount": str(l.total_overdue_amount) if l.total_overdue_amount else None,
            "generated_at": l.generated_at.isoformat() if l.generated_at else None,
            "sent_at": l.sent_at.isoformat() if l.sent_at else None,
            "signed_by": l.signed_by,
            "notes": l.notes,
        }
        for l in letters
    ]


@router.patch("/legal-letters/{letter_id}/status")
async def update_letter_status(
    letter_id: UUID,
    body: UpdateLetterStatusRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Update status of a legal letter (e.g., mark as reviewed, signed, sent).
    Also records a PlanActivityORM entry.
    """
    from uuid import uuid4
    import json as _json
    from datetime import datetime, timezone

    letter = await db.get(LegalLetterORM, letter_id)
    if not letter:
        raise HTTPException(status_code=404, detail="Letter not found")

    valid_statuses = {"generated", "reviewed", "signed", "sent", "delivered", "voided"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=422, detail=f"Invalid status. Must be one of: {valid_statuses}")

    prev_status = letter.status
    letter.status = body.status
    if body.signed_by:
        letter.signed_by = body.signed_by
    if body.notes:
        letter.notes = body.notes
    if body.status == "sent":
        letter.sent_at = datetime.now(timezone.utc)

    # ── Activity log ──────────────────────────────────────────────────────────
    db.add(PlanActivityORM(
        id=uuid4(),
        plan_id=letter.plan_id,
        action_type="status_changed",
        channel="system",
        actor=body.signed_by or "officer",
        description=f"Carta legal actualizada: {prev_status} → {body.status}." + (f" Firmada por: {body.signed_by}." if body.signed_by else ""),
        metadata_json=_json.dumps({
            "letter_id": str(letter_id),
            "prev_status": prev_status,
            "new_status": body.status,
            "signed_by": body.signed_by,
            "notes": body.notes,
        }, ensure_ascii=False),
        related_entity_id=str(letter_id),
    ))

    await db.commit()

    return {
        "letter_id": str(letter_id),
        "plan_id": str(letter.plan_id),
        "status": letter.status,
        "signed_by": letter.signed_by,
        "sent_at": letter.sent_at.isoformat() if letter.sent_at else None,
    }
