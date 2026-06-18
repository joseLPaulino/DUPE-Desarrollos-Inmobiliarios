"""SQLAlchemy implementation of ProjectRepository."""
from __future__ import annotations
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.domain.models import Project, Unit, ProjectStatus, ProjectType
from dupe_platform.domain.ports.repositories import ProjectRepository
from ..models import ProjectORM, UnitORM


class SqlProjectRepository(ProjectRepository):

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    # ── Mapping helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _to_project(row: ProjectORM) -> Project:
        return Project(
            id=row.id,
            name=row.name,
            project_type=ProjectType(row.project_type),
            status=ProjectStatus(row.status),
            start_date=row.start_date,
            expected_delivery_date=row.expected_delivery_date,
            total_units=row.total_units,
            currency=row.currency,
            total_budget=row.total_budget,
            physical_progress_pct=row.physical_progress_pct,
            notes=row.notes or "",
        )

    @staticmethod
    def _to_unit(row: UnitORM) -> Unit:
        return Unit(
            id=row.id,
            project_id=row.project_id,
            unit_number=row.unit_number,
            floor=row.floor,
            area_sqm=row.area_sqm,
            list_price=row.list_price,
            is_sold=row.is_sold,
            client_id=row.client_id,
        )

    # ── Interface ──────────────────────────────────────────────────────────────

    async def get(self, project_id: UUID) -> Project | None:
        row = await self._s.get(ProjectORM, project_id)
        return self._to_project(row) if row else None

    async def list_all(self) -> list[Project]:
        result = await self._s.execute(select(ProjectORM).order_by(ProjectORM.name))
        return [self._to_project(r) for r in result.scalars()]

    async def save(self, project: Project) -> None:
        existing = await self._s.get(ProjectORM, project.id)
        if existing:
            existing.name = project.name
            existing.status = project.status.value
            existing.physical_progress_pct = project.physical_progress_pct
            existing.notes = project.notes
        else:
            self._s.add(ProjectORM(
                id=project.id,
                name=project.name,
                project_type=project.project_type.value,
                status=project.status.value,
                start_date=project.start_date,
                expected_delivery_date=project.expected_delivery_date,
                total_units=project.total_units,
                currency=project.currency,
                total_budget=project.total_budget,
                physical_progress_pct=project.physical_progress_pct,
                notes=project.notes,
            ))
        await self._s.flush()

    async def get_units(self, project_id: UUID) -> list[Unit]:
        result = await self._s.execute(
            select(UnitORM)
            .where(UnitORM.project_id == project_id)
            .order_by(UnitORM.unit_number)
        )
        return [self._to_unit(r) for r in result.scalars()]

    async def save_unit(self, unit: Unit) -> None:
        existing = await self._s.get(UnitORM, unit.id)
        if existing:
            existing.is_sold = unit.is_sold
            existing.client_id = unit.client_id
        else:
            self._s.add(UnitORM(
                id=unit.id,
                project_id=unit.project_id,
                unit_number=unit.unit_number,
                floor=unit.floor,
                area_sqm=unit.area_sqm,
                list_price=unit.list_price,
                is_sold=unit.is_sold,
                client_id=unit.client_id,
            ))
        await self._s.flush()
