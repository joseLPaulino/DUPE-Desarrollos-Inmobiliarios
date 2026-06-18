"""SQLAlchemy implementation of PaymentPlanRepository."""
from __future__ import annotations
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from dupe_platform.domain.models import PaymentPlan, Installment, InstallmentStatus
from dupe_platform.domain.models.payment_plan import EscalationLevel
from dupe_platform.domain.ports.repositories import PaymentPlanRepository
from ..models import PaymentPlanORM, InstallmentORM


class SqlPaymentPlanRepository(PaymentPlanRepository):

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    # ── Mappers ────────────────────────────────────────────────────────────────

    @staticmethod
    def _installment_to_domain(row: InstallmentORM) -> Installment:
        return Installment(
            id=row.id,
            plan_id=row.plan_id,
            installment_number=row.installment_number,
            due_date=row.due_date,
            amount=row.amount,
            status=InstallmentStatus(row.status),
            paid_date=row.paid_date,
            paid_amount=row.paid_amount,
            escalation_level=EscalationLevel(row.escalation_level) if row.escalation_level else EscalationLevel.NONE,
            days_overdue=row.days_overdue or 0,
            notes=row.notes or "",
        )

    @staticmethod
    def _plan_to_domain(row: PaymentPlanORM) -> PaymentPlan:
        installments = [
            SqlPaymentPlanRepository._installment_to_domain(i)
            for i in sorted(row.installments, key=lambda x: x.installment_number)
        ]
        return PaymentPlan(
            id=row.id,
            client_id=row.client_id,
            unit_id=row.unit_id,
            project_id=row.project_id,
            sale_date=row.sale_date,
            total_amount=row.total_amount,
            installments=installments,
            is_active=row.is_active,
            approved_by=row.approved_by,
            notes=row.notes or "",
        )

    # ── Interface ──────────────────────────────────────────────────────────────

    async def get(self, plan_id: UUID) -> PaymentPlan | None:
        result = await self._s.execute(
            select(PaymentPlanORM)
            .options(selectinload(PaymentPlanORM.installments))
            .where(PaymentPlanORM.id == plan_id)
        )
        row = result.scalar_one_or_none()
        return self._plan_to_domain(row) if row else None

    async def list_by_project(self, project_id: UUID) -> list[PaymentPlan]:
        result = await self._s.execute(
            select(PaymentPlanORM)
            .options(selectinload(PaymentPlanORM.installments))
            .where(PaymentPlanORM.project_id == project_id)
            .order_by(PaymentPlanORM.created_at.desc())
        )
        return [self._plan_to_domain(r) for r in result.scalars()]

    async def list_by_client(self, client_id: UUID) -> list[PaymentPlan]:
        result = await self._s.execute(
            select(PaymentPlanORM)
            .options(selectinload(PaymentPlanORM.installments))
            .where(PaymentPlanORM.client_id == client_id)
        )
        return [self._plan_to_domain(r) for r in result.scalars()]

    async def save(self, plan: PaymentPlan) -> None:
        existing = await self._s.get(PaymentPlanORM, plan.id)
        if existing:
            existing.is_active = plan.is_active
            existing.approved_by = plan.approved_by
            existing.notes = plan.notes
        else:
            orm_plan = PaymentPlanORM(
                id=plan.id,
                client_id=plan.client_id,
                unit_id=plan.unit_id,
                project_id=plan.project_id,
                sale_date=plan.sale_date,
                total_amount=plan.total_amount,
                is_active=plan.is_active,
                approved_by=plan.approved_by,
                notes=plan.notes,
            )
            self._s.add(orm_plan)
            await self._s.flush()

        # Upsert installments
        for inst in plan.installments:
            existing_inst = await self._s.get(InstallmentORM, inst.id)
            if existing_inst:
                existing_inst.status = inst.status.value
                existing_inst.paid_date = inst.paid_date
                existing_inst.paid_amount = inst.paid_amount
                existing_inst.escalation_level = inst.escalation_level.value
                existing_inst.days_overdue = inst.days_overdue
                existing_inst.notes = inst.notes
            else:
                self._s.add(InstallmentORM(
                    id=inst.id,
                    plan_id=inst.plan_id,
                    installment_number=inst.installment_number,
                    due_date=inst.due_date,
                    amount=inst.amount,
                    status=inst.status.value,
                    paid_date=inst.paid_date,
                    paid_amount=inst.paid_amount,
                    escalation_level=inst.escalation_level.value,
                    days_overdue=inst.days_overdue,
                    notes=inst.notes,
                ))
        await self._s.flush()

    async def get_overdue_installments(self) -> list[Installment]:
        result = await self._s.execute(
            select(InstallmentORM)
            .where(InstallmentORM.status == "overdue")
            .order_by(InstallmentORM.days_overdue.desc())
        )
        return [self._installment_to_domain(r) for r in result.scalars()]

    async def get_installments_due_soon(self, days_ahead: int) -> list[Installment]:
        from datetime import timedelta
        today = date.today()
        cutoff = today + timedelta(days=days_ahead)
        result = await self._s.execute(
            select(InstallmentORM)
            .where(
                InstallmentORM.due_date >= today,
                InstallmentORM.due_date <= cutoff,
                InstallmentORM.status == "pending",
            )
            .order_by(InstallmentORM.due_date)
        )
        return [self._installment_to_domain(r) for r in result.scalars()]
