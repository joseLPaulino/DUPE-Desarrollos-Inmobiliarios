"""Cash flow router — 60-month projections and Excel upload."""
from __future__ import annotations
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.inbound.api.deps import get_db
from dupe_platform.adapters.outbound.persistence.models import (
    CashFlowMonthlyORM, ProjectORM,
)

router = APIRouter()
logger = logging.getLogger("dupe.cashflow")


@router.get("/{project_id}")
async def get_cashflow(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return all monthly cash flow records for a project."""
    # Verify project exists
    proj = await db.scalar(select(ProjectORM).where(ProjectORM.id == project_id))
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(CashFlowMonthlyORM)
        .where(CashFlowMonthlyORM.project_id == project_id)
        .order_by(CashFlowMonthlyORM.month_number)
    )
    rows = result.scalars().all()

    return [
        {
            "month": r.month,
            "month_number": r.month_number,
            "is_actual": r.is_actual,
            "income": float(r.income),
            "expenses": float(r.expenses),
            "net_cash_flow": float(r.net_cash_flow),
            "cumulative_balance": float(r.cumulative_balance),
            "breakdown": {
                "income": {
                    "separaciones": float(r.income_separaciones),
                    "entregas": float(r.income_entregas),
                    "financiamiento": float(r.income_financiamiento),
                },
                "expenses": {
                    "construccion": float(r.exp_construccion),
                    "suelo": float(r.exp_suelo),
                    "tecnicos": float(r.exp_tecnicos),
                    "juridico": float(r.exp_juridico),
                    "financiero": float(r.exp_financiero),
                    "gestion": float(r.exp_gestion),
                    "comercializacion": float(r.exp_comercializacion),
                },
            },
        }
        for r in rows
    ]


@router.post("/import/{project_id}")
async def import_cashflow_excel(
    project_id: UUID,
    file: UploadFile = File(...),
    project_type: str = "social",
    db: AsyncSession = Depends(get_db),
):
    """Upload and parse a DUPE Excel financial model to update cash flow records."""
    import tempfile, os
    from dupe_platform.integrations.excel_cashflow_parser import (
        parse_social_cashflow, parse_tourist_cashflow
    )

    proj = await db.scalar(select(ProjectORM).where(ProjectORM.id == project_id))
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    # Save upload to temp file
    suffix = ".xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        parser = parse_tourist_cashflow if project_type == "tourist" else parse_social_cashflow
        records = parser(tmp_path)
    finally:
        os.unlink(tmp_path)

    if not records:
        raise HTTPException(status_code=400, detail="No cash flow data parsed from file")

    # Delete existing cash flow for this project, then insert fresh
    from sqlalchemy import delete as sa_delete
    await db.execute(
        sa_delete(CashFlowMonthlyORM).where(CashFlowMonthlyORM.project_id == project_id)
    )
    from uuid import uuid4
    from decimal import Decimal
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
    await db.commit()

    return {"imported": len(records), "project_id": str(project_id)}
