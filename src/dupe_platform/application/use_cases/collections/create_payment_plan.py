"""Use case: Create and (optionally) activate a payment plan for a sale."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import UUID

from dupe_platform.domain.models import PaymentPlan
from dupe_platform.domain.ports import ClientRepository, PaymentPlanRepository, ProjectRepository


@dataclass
class CreatePaymentPlanCommand:
    client_id: UUID
    unit_id: UUID
    project_id: UUID
    sale_date: date
    sale_price: Decimal
    num_installments: int = 12


@dataclass
class CreatePaymentPlanResult:
    plan: PaymentPlan
    requires_approval: bool   # [A-APPROVAL: approver role TBD — left pending for client decision]


class CreatePaymentPlanUseCase:
    def __init__(
        self,
        project_repo: ProjectRepository,
        client_repo: ClientRepository,
        plan_repo: PaymentPlanRepository,
        auto_activate: bool = False,   # [A-APPROVAL: set True if client chooses auto-activate]
    ):
        self._project_repo = project_repo
        self._client_repo  = client_repo
        self._plan_repo    = plan_repo
        self._auto_activate = auto_activate

    async def execute(self, cmd: CreatePaymentPlanCommand) -> CreatePaymentPlanResult:
        project = await self._project_repo.get(cmd.project_id)
        if not project:
            raise ValueError(f"Project {cmd.project_id} not found")

        client = await self._client_repo.get(cmd.client_id)
        if not client:
            raise ValueError(f"Client {cmd.client_id} not found")

        plan = PaymentPlan.generate(
            client_id=cmd.client_id,
            unit_id=cmd.unit_id,
            project_id=cmd.project_id,
            sale_date=cmd.sale_date,
            delivery_date=project.expected_delivery_date,
            sale_price=cmd.sale_price,
            num_installments=cmd.num_installments,
        )

        if self._auto_activate:
            plan.is_active = True
            plan.approved_by = "system"

        await self._plan_repo.save(plan)
        return CreatePaymentPlanResult(plan=plan, requires_approval=not plan.is_active)
