"""Collections — payment plans router."""
from uuid import UUID
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dupe_platform.application.use_cases.collections.create_payment_plan import (
    CreatePaymentPlanCommand, CreatePaymentPlanUseCase,
)
from dupe_platform.domain.ports import PaymentPlanRepository
from dupe_platform.adapters.inbound.api.deps import (
    get_payment_plan_repo, get_create_plan_use_case,
)

router = APIRouter()


class CreatePlanRequest(BaseModel):
    client_id: UUID
    unit_id: UUID
    project_id: UUID
    sale_date: date
    sale_price: Decimal
    num_installments: int = 12


@router.post("/")
async def create_payment_plan(
    body: CreatePlanRequest,
    use_case: CreatePaymentPlanUseCase = Depends(get_create_plan_use_case),
):
    cmd = CreatePaymentPlanCommand(**body.model_dump())
    result = await use_case.execute(cmd)
    plan = result.plan
    return {
        "plan_id": str(plan.id),
        "requires_approval": result.requires_approval,
        "is_active": plan.is_active,
        "total_amount": str(plan.total_amount),
        "installments": [
            {
                "number": i.installment_number,
                "due_date": i.due_date.isoformat(),
                "amount": str(i.amount),
                "status": i.status.value,
            }
            for i in plan.installments
        ],
    }


@router.get("/project/{project_id}")
async def list_plans_by_project(
    project_id: UUID,
    repo: PaymentPlanRepository = Depends(get_payment_plan_repo),
):
    plans = await repo.list_by_project(project_id)
    return [
        {
            "plan_id": str(p.id),
            "client_id": str(p.client_id),
            "unit_id": str(p.unit_id),
            "sale_date": p.sale_date.isoformat(),
            "total_amount": str(p.total_amount),
            "total_paid": str(p.total_paid),
            "total_balance": str(p.total_balance),
            "is_active": p.is_active,
            "overdue_count": len(p.overdue_installments),
        }
        for p in plans
    ]


@router.patch("/{plan_id}/approve")
async def approve_plan(
    plan_id: UUID,
    approved_by: str,
    repo: PaymentPlanRepository = Depends(get_payment_plan_repo),
):
    """
    Approve a payment plan — activates it for monitoring.
    [A-APPROVAL: approver role TBD — any authenticated user for now]
    """
    plan = await repo.get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    plan.is_active = True
    plan.approved_by = approved_by
    await repo.save(plan)
    return {"plan_id": str(plan_id), "approved_by": approved_by, "is_active": True}


@router.get("/overdue")
async def get_overdue(repo: PaymentPlanRepository = Depends(get_payment_plan_repo)):
    installments = await repo.get_overdue_installments()
    return [
        {
            "installment_id": str(i.id),
            "plan_id": str(i.plan_id),
            "due_date": i.due_date.isoformat(),
            "days_overdue": i.days_overdue,
            "amount": str(i.amount),
            "balance_due": str(i.balance_due),
            "escalation_level": i.escalation_level.value,
        }
        for i in installments
    ]
