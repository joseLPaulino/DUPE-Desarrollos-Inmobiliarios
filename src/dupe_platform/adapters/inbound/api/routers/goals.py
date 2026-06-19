"""
Goal management — cross-cutting across all 5 departments.

Management assigns numeric targets (metas) per officer per period.
Officers track their own progress. Management sees aggregate performance.

Endpoints
─────────
POST /goals                  — create a goal
GET  /goals                  — list goals (filter by department, officer, period)
GET  /goals/performance      — aggregate performance dashboard (all officers)
DELETE /goals/{id}           — remove a goal
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.inbound.api.deps import get_db
from dupe_platform.adapters.outbound.persistence.models import (
    OfficerGoalORM, InstallmentORM, PaymentPlanORM, InvoiceORM,
    PartidaExecutionORM,
)

router = APIRouter()

DEPARTMENTS = {"cobros", "finanzas", "comercial", "gestion", "postventa"}


class GoalIn(BaseModel):
    department: str
    officer_name: str
    metric_name: str
    metric_unit: str = "RD$"
    target_value: float
    period: str                 # "YYYY-MM"
    notes: str = ""


class GoalOut(BaseModel):
    id: str
    department: str
    officer_name: str
    metric_name: str
    metric_unit: str
    target_value: float
    period: str
    notes: str
    created_at: datetime


def _n(v) -> float:
    try:
        return float(v or 0)
    except Exception:
        return 0.0


def _goal_out(g: OfficerGoalORM) -> dict:
    return {
        "id": str(g.id),
        "department": g.department,
        "officer_name": g.officer_name,
        "metric_name": g.metric_name,
        "metric_unit": g.metric_unit,
        "target_value": _n(g.target_value),
        "period": g.period,
        "notes": g.notes,
        "created_at": g.created_at,
    }


@router.post("", response_model=GoalOut, status_code=201)
async def create_goal(body: GoalIn, db: AsyncSession = Depends(get_db)):
    if body.department not in DEPARTMENTS:
        raise HTTPException(
            status_code=422,
            detail=f"department must be one of: {sorted(DEPARTMENTS)}"
        )
    goal = OfficerGoalORM(
        id=uuid.uuid4(),
        department=body.department,
        officer_name=body.officer_name,
        metric_name=body.metric_name,
        metric_unit=body.metric_unit,
        target_value=Decimal(str(body.target_value)),
        period=body.period,
        notes=body.notes,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return _goal_out(goal)


@router.get("", response_model=list[GoalOut])
async def list_goals(
    department: Optional[str] = Query(None),
    officer_name: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(OfficerGoalORM)
    if department:
        q = q.where(OfficerGoalORM.department == department)
    if officer_name:
        q = q.where(OfficerGoalORM.officer_name == officer_name)
    if period:
        q = q.where(OfficerGoalORM.period == period)
    q = q.order_by(OfficerGoalORM.period.desc(), OfficerGoalORM.department, OfficerGoalORM.officer_name)
    result = await db.execute(q)
    return [_goal_out(g) for g in result.scalars().all()]


@router.delete("/{goal_id}", status_code=204)
async def delete_goal(goal_id: str, db: AsyncSession = Depends(get_db)):
    goal = await db.get(OfficerGoalORM, uuid.UUID(goal_id))
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    await db.delete(goal)
    await db.commit()


@router.get("/performance")
async def performance_dashboard(
    period: Optional[str] = Query(None, description="YYYY-MM filter"),
    db: AsyncSession = Depends(get_db),
):
    """
    Aggregate performance: for each goal, compute actual value and progress %.

    Actual value is auto-computed from live data where possible:
    - cobros / metric contains "cobrado": sum of paid installment amounts for the period
    - finanzas / metric contains "factura": count of invoices registered for the period
    - Other metrics: manual entry not yet implemented, actual = 0 (placeholder)
    """
    q = select(OfficerGoalORM)
    if period:
        q = q.where(OfficerGoalORM.period == period)
    q = q.order_by(OfficerGoalORM.department, OfficerGoalORM.officer_name)
    result = await db.execute(q)
    goals = result.scalars().all()

    rows = []
    for g in goals:
        actual = 0.0

        # Auto-compute for known metric types
        if g.department == "cobros" and "cobrado" in g.metric_name.lower():
            # Sum of paid installments in the period month
            if g.period and len(g.period) == 7:
                yr, mo = g.period.split("-")
                from datetime import date as d
                from sqlalchemy import extract
                r = await db.execute(
                    select(__import__('sqlalchemy', fromlist=['func']).func.coalesce(
                        __import__('sqlalchemy', fromlist=['func']).func.sum(
                            InstallmentORM.paid_amount
                        ), Decimal(0)
                    )).where(
                        InstallmentORM.status == "paid",
                        __import__('sqlalchemy', fromlist=['func']).func.extract('year', InstallmentORM.paid_date) == int(yr),
                        __import__('sqlalchemy', fromlist=['func']).func.extract('month', InstallmentORM.paid_date) == int(mo),
                    )
                )
                actual = _n(r.scalar())

        elif g.department == "finanzas" and "factura" in g.metric_name.lower():
            if g.period and len(g.period) == 7:
                yr, mo = g.period.split("-")
                from sqlalchemy import func as sfunc
                r = await db.execute(
                    select(sfunc.count(InvoiceORM.id)).where(
                        sfunc.extract('year', InvoiceORM.invoice_date) == int(yr),
                        sfunc.extract('month', InvoiceORM.invoice_date) == int(mo),
                    )
                )
                actual = _n(r.scalar())

        target = _n(g.target_value)
        pct = round((actual / target * 100) if target > 0 else 0, 1)
        status = "verde" if pct >= 90 else ("ambar" if pct >= 60 else "rojo")

        rows.append({
            "id": str(g.id),
            "department": g.department,
            "officer_name": g.officer_name,
            "metric_name": g.metric_name,
            "metric_unit": g.metric_unit,
            "period": g.period,
            "target_value": target,
            "actual_value": round(actual, 2),
            "progress_pct": pct,
            "status": status,
            "notes": g.notes,
        })

    return rows
