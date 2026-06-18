"""Dashboard router — executive KPI endpoint."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from decimal import Decimal

from dupe_platform.application.use_cases.finance.get_dashboard import (
    DashboardData, GetDashboardUseCase,
)
from dupe_platform.adapters.inbound.api.deps import get_dashboard_use_case

router = APIRouter()


@router.get("/{project_id}", response_model=DashboardData)
async def get_dashboard(
    project_id: UUID,
    use_case: GetDashboardUseCase = Depends(get_dashboard_use_case),
):
    try:
        return await use_case.execute(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/", response_model=list[dict])
async def list_project_summaries(
    use_case: GetDashboardUseCase = Depends(get_dashboard_use_case),
):
    """Quick summary of all projects for the dashboard overview."""
    from dupe_platform.adapters.inbound.api.deps import get_project_repo
    # Returns mini summary — full KPIs fetched per project
    return []   # TODO: wire per-project summaries
