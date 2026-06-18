"""SQLAlchemy implementation of BudgetRepository."""
from __future__ import annotations
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from dupe_platform.domain.models import Budget
from dupe_platform.domain.models.budget import Partida, PartidaExecution, PartidaType
from dupe_platform.domain.ports.repositories import BudgetRepository
from ..models import BudgetORM, PartidaORM, PartidaExecutionORM


class SqlBudgetRepository(BudgetRepository):

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    # ── Mappers ────────────────────────────────────────────────────────────────

    @staticmethod
    def _to_partida(row: PartidaORM) -> Partida:
        return Partida(
            id=row.id,
            budget_id=row.budget_id,
            code=row.code,
            name=row.name,
            partida_type=PartidaType(row.partida_type),
            budgeted_amount=row.budgeted_amount,
            parent_id=row.parent_id,
        )

    @staticmethod
    def _to_execution(row: PartidaExecutionORM) -> PartidaExecution:
        return PartidaExecution(
            id=row.id,
            partida_id=row.partida_id,
            project_id=row.project_id,
            amount=row.amount,
            execution_date=row.execution_date,
            transaction_id=row.transaction_id,
            description=row.description or "",
            entered_by=row.entered_by or "system",
        )

    @staticmethod
    def _to_domain(row: BudgetORM) -> Budget:
        return Budget(
            id=row.id,
            project_id=row.project_id,
            version=row.version,
            approved_date=row.approved_date,
            partidas=[SqlBudgetRepository._to_partida(p) for p in row.partidas],
            executions=[SqlBudgetRepository._to_execution(e) for e in row.executions],
        )

    # ── Interface ──────────────────────────────────────────────────────────────

    async def get_by_project(self, project_id: UUID) -> Budget | None:
        result = await self._s.execute(
            select(BudgetORM)
            .options(
                selectinload(BudgetORM.partidas),
                selectinload(BudgetORM.executions),
            )
            .where(BudgetORM.project_id == project_id)
            .order_by(BudgetORM.version.desc())
            .limit(1)
        )
        row = result.scalar_one_or_none()
        return self._to_domain(row) if row else None

    async def save(self, budget: Budget) -> None:
        existing = await self._s.get(BudgetORM, budget.id)
        if not existing:
            self._s.add(BudgetORM(
                id=budget.id,
                project_id=budget.project_id,
                version=budget.version,
                approved_date=budget.approved_date,
            ))
            await self._s.flush()

        # Upsert partidas
        for p in budget.partidas:
            ep = await self._s.get(PartidaORM, p.id)
            if not ep:
                self._s.add(PartidaORM(
                    id=p.id,
                    budget_id=p.budget_id,
                    code=p.code,
                    name=p.name,
                    partida_type=p.partida_type.value,
                    budgeted_amount=p.budgeted_amount,
                    parent_id=p.parent_id,
                ))

        # Upsert executions
        for e in budget.executions:
            ee = await self._s.get(PartidaExecutionORM, e.id)
            if not ee:
                self._s.add(PartidaExecutionORM(
                    id=e.id,
                    budget_id=budget.id,
                    partida_id=e.partida_id,
                    project_id=e.project_id,
                    amount=e.amount,
                    execution_date=e.execution_date,
                    transaction_id=e.transaction_id,
                    description=e.description,
                    entered_by=e.entered_by,
                ))

        await self._s.flush()
