"""Domain model: PaymentPlan and Installment."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import Enum
from uuid import UUID, uuid4


class InstallmentStatus(str, Enum):
    PENDING   = "pending"
    PAID      = "paid"
    OVERDUE   = "overdue"
    PARTIAL   = "partial"


class EscalationLevel(str, Enum):
    NONE       = "none"
    OFFICER    = "officer"      # Day +1
    MANAGEMENT = "management"   # Day +6
    LEGAL      = "legal"        # Day +16


@dataclass
class Installment:
    id: UUID
    plan_id: UUID
    installment_number: int
    due_date: date
    amount: Decimal
    status: InstallmentStatus = InstallmentStatus.PENDING
    paid_date: date | None = None
    paid_amount: Decimal | None = None
    escalation_level: EscalationLevel = EscalationLevel.NONE
    days_overdue: int = 0
    notes: str = ""

    @property
    def balance_due(self) -> Decimal:
        paid = self.paid_amount or Decimal("0")
        return max(self.amount - paid, Decimal("0"))

    def update_overdue_status(self, today: date) -> None:
        if self.status == InstallmentStatus.PAID:
            return
        if self.due_date < today:
            self.days_overdue = (today - self.due_date).days
            self.status = InstallmentStatus.OVERDUE
            if self.days_overdue >= 16:
                self.escalation_level = EscalationLevel.LEGAL
            elif self.days_overdue >= 6:
                self.escalation_level = EscalationLevel.MANAGEMENT
            elif self.days_overdue >= 1:
                self.escalation_level = EscalationLevel.OFFICER


@dataclass
class PaymentPlan:
    id: UUID
    client_id: UUID
    unit_id: UUID
    project_id: UUID
    sale_date: date
    total_amount: Decimal
    installments: list[Installment] = field(default_factory=list)
    is_active: bool = False             # False until approved [A-APPROVAL: approver TBD]
    approved_by: str | None = None
    notes: str = ""

    @classmethod
    def generate(
        cls,
        client_id: UUID,
        unit_id: UUID,
        project_id: UUID,
        sale_date: date,
        delivery_date: date,
        sale_price: Decimal,
        num_installments: int = 12,     # 8–16 per requirements
    ) -> "PaymentPlan":
        """Auto-generate installment schedule between sale_date and delivery_date."""
        from dateutil.relativedelta import relativedelta

        plan = cls(
            id=uuid4(),
            client_id=client_id,
            unit_id=unit_id,
            project_id=project_id,
            sale_date=sale_date,
            total_amount=sale_price,
        )

        installment_amount = (sale_price / num_installments).quantize(Decimal("0.01"))
        remainder = sale_price - (installment_amount * num_installments)

        for i in range(num_installments):
            due = sale_date + relativedelta(months=i + 1)
            amount = installment_amount + (remainder if i == num_installments - 1 else Decimal("0"))
            plan.installments.append(
                Installment(
                    id=uuid4(),
                    plan_id=plan.id,
                    installment_number=i + 1,
                    due_date=due,
                    amount=amount,
                )
            )
        return plan

    @property
    def total_paid(self) -> Decimal:
        return sum((i.paid_amount or Decimal("0")) for i in self.installments)

    @property
    def total_balance(self) -> Decimal:
        return self.total_amount - self.total_paid

    @property
    def overdue_installments(self) -> list[Installment]:
        return [i for i in self.installments if i.status == InstallmentStatus.OVERDUE]
