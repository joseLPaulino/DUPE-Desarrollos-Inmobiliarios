"""Projects router."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import date
from decimal import Decimal

from dupe_platform.domain.models import Project, ProjectStatus, ProjectType
from dupe_platform.domain.ports import ProjectRepository
from dupe_platform.adapters.inbound.api.deps import get_project_repo

router = APIRouter()


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    project_type: str
    status: str
    start_date: date
    expected_delivery_date: date
    total_units: int
    currency: str
    total_budget: Decimal
    physical_progress_pct: Decimal

    class Config:
        from_attributes = True


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(repo: ProjectRepository = Depends(get_project_repo)):
    projects = await repo.list_all()
    return [ProjectResponse(**p.__dict__) for p in projects]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: UUID, repo: ProjectRepository = Depends(get_project_repo)):
    p = await repo.get(project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(**p.__dict__)


@router.get("/{project_id}/units")
async def get_units(project_id: UUID, repo: ProjectRepository = Depends(get_project_repo)):
    units = await repo.get_units(project_id)
    return [{"id": str(u.id), "unit_number": u.unit_number, "floor": u.floor,
             "area_sqm": str(u.area_sqm), "list_price": str(u.list_price),
             "is_sold": u.is_sold} for u in units]
