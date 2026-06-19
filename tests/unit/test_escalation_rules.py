"""
Unit tests — Escalation logic (architecture invariant).

From L1 Architecture:
  Day +1  → officer dashboard alert      (EscalationLevel.OFFICER)
  Day +6  → management notification      (EscalationLevel.MANAGEMENT)
  Day +16 → legal referral flag          (EscalationLevel.LEGAL)

From get_dashboard.py use case:
  officer_queue_count    = 1 ≤ days_overdue < 6
  management_queue_count = 6 ≤ days_overdue < 16
  legal_queue_count      = days_overdue ≥ 16
"""
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest

from dupe_platform.domain.models.payment_plan import (
    Installment, InstallmentStatus, EscalationLevel,
)


def make_installment(due_days_ago: int) -> Installment:
    """Return a PENDING installment due `due_days_ago` days in the past."""
    today = date.today()
    inst = Installment(
        id=uuid4(),
        plan_id=uuid4(),
        installment_number=1,
        due_date=today - timedelta(days=due_days_ago),
        amount=Decimal("50_000"),
        status=InstallmentStatus.PENDING,
    )
    return inst


class TestEscalationLevels:

    def test_not_overdue_no_escalation(self):
        """Installment due tomorrow — no escalation."""
        today = date.today()
        inst = Installment(
            id=uuid4(), plan_id=uuid4(), installment_number=1,
            due_date=today + timedelta(days=1),
            amount=Decimal("50_000"),
        )
        inst.update_overdue_status(today)
        assert inst.escalation_level == EscalationLevel.NONE
        assert inst.status == InstallmentStatus.PENDING

    def test_due_today_no_escalation(self):
        today = date.today()
        inst = Installment(
            id=uuid4(), plan_id=uuid4(), installment_number=1,
            due_date=today, amount=Decimal("50_000"),
        )
        inst.update_overdue_status(today)
        assert inst.escalation_level == EscalationLevel.NONE

    def test_day_1_is_officer(self):
        inst = make_installment(due_days_ago=1)
        inst.update_overdue_status(date.today())
        assert inst.escalation_level == EscalationLevel.OFFICER
        assert inst.status == InstallmentStatus.OVERDUE

    def test_day_5_still_officer(self):
        inst = make_installment(due_days_ago=5)
        inst.update_overdue_status(date.today())
        assert inst.escalation_level == EscalationLevel.OFFICER

    def test_day_6_is_management(self):
        inst = make_installment(due_days_ago=6)
        inst.update_overdue_status(date.today())
        assert inst.escalation_level == EscalationLevel.MANAGEMENT

    def test_day_15_still_management(self):
        inst = make_installment(due_days_ago=15)
        inst.update_overdue_status(date.today())
        assert inst.escalation_level == EscalationLevel.MANAGEMENT

    def test_day_16_is_legal(self):
        inst = make_installment(due_days_ago=16)
        inst.update_overdue_status(date.today())
        assert inst.escalation_level == EscalationLevel.LEGAL

    def test_day_30_is_legal(self):
        inst = make_installment(due_days_ago=30)
        inst.update_overdue_status(date.today())
        assert inst.escalation_level == EscalationLevel.LEGAL

    def test_paid_installment_not_updated(self):
        """Paid installments must not be re-escalated even if overdue by date."""
        today = date.today()
        inst = Installment(
            id=uuid4(), plan_id=uuid4(), installment_number=1,
            due_date=today - timedelta(days=30),
            amount=Decimal("50_000"),
            status=InstallmentStatus.PAID,
            paid_date=today - timedelta(days=20),
            paid_amount=Decimal("50_000"),
        )
        inst.update_overdue_status(today)
        # Status and escalation must remain unchanged
        assert inst.status == InstallmentStatus.PAID
        assert inst.escalation_level == EscalationLevel.NONE


class TestDashboardQueueCounts:
    """
    Reproduce the queue-count logic from GetDashboardUseCase exactly.
    If this logic changes, it must be reflected in the frontend display.
    """

    def _queue_counts(self, overdue_days_list: list[int]) -> dict:
        all_overdue = [make_installment(d) for d in overdue_days_list]
        today = date.today()
        for inst in all_overdue:
            inst.update_overdue_status(today)

        officer_q = sum(1 for i in all_overdue if 1 <= i.days_overdue < 6)
        mgmt_q    = sum(1 for i in all_overdue if 6 <= i.days_overdue < 16)
        legal_q   = sum(1 for i in all_overdue if i.days_overdue >= 16)
        return {"officer": officer_q, "management": mgmt_q, "legal": legal_q}

    def test_counts_split_correctly(self):
        counts = self._queue_counts([1, 3, 5, 6, 10, 15, 16, 30])
        assert counts["officer"]    == 3   # days 1, 3, 5
        assert counts["management"] == 3   # days 6, 10, 15
        assert counts["legal"]      == 2   # days 16, 30

    def test_boundary_day_6_goes_to_management_not_officer(self):
        counts = self._queue_counts([5, 6])
        assert counts["officer"]    == 1   # day 5
        assert counts["management"] == 1   # day 6

    def test_boundary_day_16_goes_to_legal_not_management(self):
        counts = self._queue_counts([15, 16])
        assert counts["management"] == 1   # day 15
        assert counts["legal"]      == 1   # day 16

    def test_empty_gives_zeros(self):
        counts = self._queue_counts([])
        assert counts == {"officer": 0, "management": 0, "legal": 0}
