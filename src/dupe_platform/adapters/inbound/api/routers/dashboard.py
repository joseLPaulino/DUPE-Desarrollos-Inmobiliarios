"""Dashboard router — executive KPI endpoint."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException

from dupe_platform.application.use_cases.finance.get_dashboard import (
    DashboardData, GetDashboardUseCase,
)
from dupe_platform.adapters.inbound.api.deps import get_dashboard_use_case, get_project_repo
from dupe_platform.domain.ports import ProjectRepository

router = APIRouter()


@router.get("/", response_model=list[dict])
async def list_project_summaries(
    project_repo: ProjectRepository = Depends(get_project_repo),
):
    """Summary of all projects for the dashboard overview card."""
    projects = await project_repo.list_all()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "status": p.status.value,
            "project_type": p.project_type.value,
            "total_units": p.total_units,
            "currency": p.currency,
            "total_budget_dop": float(p.total_budget),
            "physical_progress_pct": float(p.physical_progress_pct),
            "start_date": p.start_date.isoformat(),
            "expected_delivery_date": p.expected_delivery_date.isoformat(),
        }
        for p in projects
    ]


@router.get("/{project_id}", response_model=DashboardData)
async def get_dashboard(
    project_id: UUID,
    use_case: GetDashboardUseCase = Depends(get_dashboard_use_case),
):
    try:
        return await use_case.execute(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
