"""Use case: Aggregate KPIs for the executive dashboard."""
from __future__ import annotations
from dataclasses import dataclass, field
from decimal import Decimal
from uuid import UUID

from dupe_platform.domain.models import TrafficLight
from dupe_platform.domain.ports import (
    ProjectRepository, BudgetRepository, PaymentPlanRepository,
)


@dataclass
class PartidaKPI:
    code: str
    name: str
    budgeted: Decimal
    executed: Decimal
    pct: Decimal
    traffic_light: TrafficLight


@dataclass
class CollectionsKPI:
    total_plans: int
    active_plans: int
    total_receivable: Decimal
    total_collected: Decimal
    collection_rate_pct: Decimal
    overdue_count: int
    overdue_amount: Decimal
    officer_queue_count: int     # Day +1
    management_queue_count: int  # Day +6
    legal_queue_count: int       # Day +16


@dataclass
class DashboardData:
    project_id: UUID
    project_name: str
    currency: str
    physical_progress_pct: Decimal
    total_budget: Decimal
    total_executed: Decimal
    budget_execution_pct: Decimal
    overall_traffic_light: TrafficLight
    partida_kpis: list[PartidaKPI] = field(default_factory=list)
    collections: CollectionsKPI | None = None


class GetDashboardUseCase:
    def __init__(
        self,
        project_repo: ProjectRepository,
        budget_repo: BudgetRepository,
        plan_repo: PaymentPlanRepository,
    ):
        self._project_repo = project_repo
        self._budget_repo  = budget_repo
        self._plan_repo    = plan_repo

    async def execute(self, project_id: UUID) -> DashboardData:
        project = await self._project_repo.get(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        budget = await self._budget_repo.get_by_project(project_id)
        plans  = await self._plan_repo.list_by_project(project_id)

        # ── Budget KPIs ───────────────────────────────────────────────────────
        partida_kpis = []
        if budget:
            for p in budget.partidas:
                executed = budget.execution_for(p.id)
                pct      = budget.execution_pct(p.id)
                partida_kpis.append(PartidaKPI(
                    code=p.code,
                    name=p.name,
                    budgeted=p.budgeted_amount,
                    executed=executed,
                    pct=pct,
                    traffic_light=budget.traffic_light(p.id),
                ))

        total_executed = budget.total_executed_expense if budget else Decimal("0")
        total_budget   = budget.total_budgeted_expense if budget else project.total_budget
        exec_pct = (
            (total_executed / total_budget * 100).quantize(Decimal("0.1"))
            if total_budget > 0 else Decimal("0")
        )
        overall_light = (
            TrafficLight.RED   if exec_pct >= 100 else
            TrafficLight.AMBER if exec_pct >= 90  else
            TrafficLight.GREEN
        )

        # ── Collections KPIs ──────────────────────────────────────────────────
        active_plans    = [pl for pl in plans if pl.is_active]
        total_recv      = sum(pl.total_amount  for pl in active_plans)
        total_collected = sum(pl.total_paid    for pl in active_plans)
        collection_rate = (
            (total_collected / total_recv * 100).quantize(Decimal("0.1"))
            if total_recv > 0 else Decimal("0")
        )
        all_overdue = [i for pl in active_plans for i in pl.overdue_installments]
        officer_q    = sum(1 for i in all_overdue if 1 <= i.days_overdue < 6)
        mgmt_q       = sum(1 for i in all_overdue if 6 <= i.days_overdue < 16)
        legal_q      = sum(1 for i in all_overdue if i.days_overdue >= 16)

        collections_kpi = CollectionsKPI(
            total_plans=len(plans),
            active_plans=len(active_plans),
            total_receivable=total_recv,
            total_collected=total_collected,
            collection_rate_pct=collection_rate,
            overdue_count=len(all_overdue),
            overdue_amount=sum(i.balance_due for i in all_overdue),
            officer_queue_count=officer_q,
            management_queue_count=mgmt_q,
            legal_queue_count=legal_q,
        )

        return DashboardData(
            project_id=project.id,
            project_name=project.name,
            currency=project.currency,
            physical_progress_pct=project.physical_progress_pct,
            total_budget=total_budget,
            total_executed=total_executed,
            budget_execution_pct=exec_pct,
            overall_traffic_light=overall_light,
            partida_kpis=partida_kpis,
            collections=collections_kpi,
        )
