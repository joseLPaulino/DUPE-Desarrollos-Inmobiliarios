"""Finance — bank reconciliation router."""
from __future__ import annotations
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import io

from dupe_platform.application.use_cases.finance.reconcile_transactions import (
    ReconcileTransactionsUseCase,
)
from dupe_platform.adapters.inbound.api.deps import get_reconcile_use_case
from dupe_platform.adapters.outbound.persistence.database import get_db
from dupe_platform.adapters.outbound.persistence.models import (
    BankTransactionORM, BudgetORM, PartidaORM, PartidaExecutionORM,
)

router = APIRouter()


# ── Request schemas ───────────────────────────────────────────────────────────

class ManualTransactionRequest(BaseModel):
    description: str
    amount: float          # positive = income/credit, negative = expense/debit
    transaction_date: str  # ISO date "YYYY-MM-DD"
    partida_code: Optional[str] = None
    reference: Optional[str] = None


class ExecutionRequest(BaseModel):
    project_id: str
    partida_code: str
    amount: float
    description: str
    entered_by: str


@router.post("/upload/{project_id}")
async def upload_bank_statement(
    project_id: UUID,
    file: UploadFile = File(...),
    use_case: ReconcileTransactionsUseCase = Depends(get_reconcile_use_case),
):
    """
    Upload a Banco Popular CSV/TXT bank statement and run reconciliation.
    [BLOCKED: A-BANK] Synthetic parser used until real sample is provided.
    """
    content = await file.read()
    result = await use_case.execute(
        project_id=project_id,
        file=io.BytesIO(content),
        filename=file.filename or "statement.csv",
    )
    return {
        "project_id": str(project_id),
        "total_transactions": result.total_transactions,
        "auto_matched": result.auto_matched,
        "queued_for_review": result.queued_for_review,
        "unmatched": result.unmatched,
        "auto_match_rate_pct": round(
            result.auto_matched / result.total_transactions * 100, 1
        ) if result.total_transactions > 0 else 0,
        "matches": result.matches,
    }


@router.post("/transaction/{project_id}")
async def create_manual_transaction(
    project_id: UUID,
    body: ManualTransactionRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Manually register a bank transaction (income or expense) for a project.
    If partida_code is provided, also creates a PartidaExecution record.
    """
    tx_date = date.fromisoformat(body.transaction_date)
    amount = Decimal(str(body.amount))

    tx = BankTransactionORM(
        id=uuid4(),
        transaction_date=tx_date,
        value_date=tx_date,
        description=body.description,
        reference=body.reference or "",
        amount=amount,
        balance_after=Decimal("0"),  # unknown for manual entries
        raw_line="manual_entry",
        status="matched" if body.partida_code else "unmatched",
    )
    db.add(tx)
    await db.flush()

    execution_id = None
    if body.partida_code:
        # Resolve budget → partida by code + project
        budget_result = await db.execute(
            select(BudgetORM)
            .where(BudgetORM.project_id == project_id)
            .order_by(BudgetORM.version.desc())
            .limit(1)
        )
        budget = budget_result.scalar_one_or_none()
        if not budget:
            raise HTTPException(status_code=404, detail="No budget found for this project")

        partida_result = await db.execute(
            select(PartidaORM)
            .where(PartidaORM.budget_id == budget.id, PartidaORM.code == body.partida_code)
        )
        partida = partida_result.scalar_one_or_none()
        if not partida:
            raise HTTPException(
                status_code=404,
                detail=f"Partida '{body.partida_code}' not found in project budget",
            )

        exec_id = uuid4()
        db.add(PartidaExecutionORM(
            id=exec_id,
            budget_id=budget.id,
            partida_id=partida.id,
            project_id=project_id,
            amount=abs(amount),
            execution_date=tx_date,
            transaction_id=tx.id,
            description=body.description,
            entered_by="manual_entry",
        ))
        execution_id = str(exec_id)
        await db.flush()

    await db.commit()
    return {
        "transaction_id": str(tx.id),
        "execution_id": execution_id,
        "status": tx.status,
        "amount": float(amount),
        "transaction_date": tx_date.isoformat(),
        "partida_code": body.partida_code,
    }


@router.post("/execution")
async def create_budget_execution(
    body: ExecutionRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a budget execution entry for a given partida.
    Enforces the 110% budget guard — returns 422 if limit exceeded.
    """
    project_id = UUID(body.project_id)
    amount = Decimal(str(body.amount))

    # Resolve budget
    budget_result = await db.execute(
        select(BudgetORM)
        .where(BudgetORM.project_id == project_id)
        .order_by(BudgetORM.version.desc())
        .limit(1)
    )
    budget = budget_result.scalar_one_or_none()
    if not budget:
        raise HTTPException(status_code=404, detail="No budget found for this project")

    # Resolve partida
    partida_result = await db.execute(
        select(PartidaORM)
        .where(PartidaORM.budget_id == budget.id, PartidaORM.code == body.partida_code)
    )
    partida = partida_result.scalar_one_or_none()
    if not partida:
        raise HTTPException(
            status_code=404,
            detail=f"Partida '{body.partida_code}' not found in project budget",
        )

    # 110% budget guard
    executed_result = await db.execute(
        select(func.coalesce(func.sum(PartidaExecutionORM.amount), 0))
        .where(PartidaExecutionORM.partida_id == partida.id)
    )
    already_executed = Decimal(str(executed_result.scalar()))
    max_allowed = partida.budgeted_amount * Decimal("1.10")

    if already_executed + amount > max_allowed:
        overrun_pct = float((already_executed + amount - partida.budgeted_amount) / partida.budgeted_amount * 100)
        raise HTTPException(
            status_code=422,
            detail=(
                f"Budget guard: executing RD${amount:,.0f} would bring '{body.partida_code}' "
                f"to {overrun_pct:.1f}% over budget (110% limit). "
                "Requires management override."
            ),
        )

    exec_id = uuid4()
    db.add(PartidaExecutionORM(
        id=exec_id,
        budget_id=budget.id,
        partida_id=partida.id,
        project_id=project_id,
        amount=amount,
        execution_date=date.today(),
        description=body.description,
        entered_by=body.entered_by,
    ))
    await db.flush()
    await db.commit()

    new_total = already_executed + amount
    execution_pct = float(new_total / partida.budgeted_amount * 100) if partida.budgeted_amount else 0

    return {
        "execution_id": str(exec_id),
        "partida_code": body.partida_code,
        "partida_name": partida.name,
        "amount": float(amount),
        "total_executed": float(new_total),
        "budgeted_amount": float(partida.budgeted_amount),
        "execution_pct": round(execution_pct, 1),
        "entered_by": body.entered_by,
        "execution_date": date.today().isoformat(),
    }
