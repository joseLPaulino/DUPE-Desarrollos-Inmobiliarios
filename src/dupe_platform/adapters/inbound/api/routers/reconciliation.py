"""Finance — bank reconciliation router."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import io

from dupe_platform.application.use_cases.finance.reconcile_transactions import (
    ReconcileTransactionsUseCase,
)
from dupe_platform.adapters.inbound.api.deps import get_reconcile_use_case

router = APIRouter()


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
