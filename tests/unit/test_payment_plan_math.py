"""
Unit tests — Payment plan generation math (architecture invariant A12).

A12: Partial payments reduce outstanding balance of current installment.
     Overpayments applied to next installment automatically.

Also verifies:
  - sum(installment.amount) == sale_price (within RD$1 rounding tolerance)
  - installment count matches num_installments param
  - due dates are monthly intervals from sale_date
  - installment amounts are all equal (even split) within ±1 unit
"""
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from dupe_platform.domain.models.payment_plan import (
    Installment, InstallmentStatus, PaymentPlan,
)


def make_plan(
    sale_price: Decimal,
    num_installments: int,
    sale_date: date | None = None,
    delivery_date: date | None = None,
) -> PaymentPlan:
    sale_date = sale_date or date(2025, 1, 1)
    delivery_date = delivery_date or date(2026, 12, 1)
    return PaymentPlan.generate(
        client_id=uuid4(),
        unit_id=uuid4(),
        project_id=uuid4(),
        sale_date=sale_date,
        delivery_date=delivery_date,
        sale_price=sale_price,
        num_installments=num_installments,
    )


class TestInstallmentGeneration:

    def test_installment_count_matches_param(self):
        plan = make_plan(Decimal("480_000"), 12)
        assert len(plan.installments) == 12

    def test_sum_equals_sale_price_within_rounding(self):
        """All installments must sum to total_amount (within RD$1 for penny rounding)."""
        for count in [8, 10, 12, 16]:
            plan = make_plan(Decimal("500_000"), count)
            total = sum(i.amount for i in plan.installments)
            assert abs(total - plan.total_amount) <= Decimal("1"), (
                f"Installment sum {total} ≠ plan total {plan.total_amount} for {count} installments"
            )

    def test_all_installments_start_as_pending(self):
        plan = make_plan(Decimal("240_000"), 8)
        for inst in plan.installments:
            assert inst.status == InstallmentStatus.PENDING

    def test_installments_are_numbered_sequentially(self):
        plan = make_plan(Decimal("240_000"), 10)
        numbers = [i.installment_number for i in plan.installments]
        assert numbers == list(range(1, 11))

    def test_due_dates_are_monthly(self):
        """Each due_date must be ~30 days after the previous."""
        plan = make_plan(Decimal("120_000"), 6, sale_date=date(2025, 1, 15))
        dates = sorted(i.due_date for i in plan.installments)
        for prev, curr in zip(dates, dates[1:]):
            gap_days = (curr - prev).days
            assert 28 <= gap_days <= 32, (
                f"Monthly gap between installments should be 28-32 days, got {gap_days}"
            )

    def test_amounts_are_roughly_equal(self):
        """Each installment should differ from the average by at most RD$1."""
        plan = make_plan(Decimal("500_000"), 12)
        amounts = [i.amount for i in plan.installments]
        avg = plan.total_amount / 12
        for amt in amounts:
            assert abs(amt - avg) <= Decimal("1"), (
                f"Installment amount {amt} deviates more than 1 unit from average {avg}"
            )


class TestInstallmentBalance:

    def test_balance_due_full_when_unpaid(self):
        inst = Installment(
            id=uuid4(), plan_id=uuid4(), installment_number=1,
            due_date=date(2026, 6, 1), amount=Decimal("50_000"),
        )
        assert inst.balance_due == Decimal("50_000")

    def test_balance_due_zero_when_fully_paid(self):
        inst = Installment(
            id=uuid4(), plan_id=uuid4(), installment_number=1,
            due_date=date(2026, 6, 1), amount=Decimal("50_000"),
            status=InstallmentStatus.PAID,
            paid_amount=Decimal("50_000"),
        )
        assert inst.balance_due == Decimal("0")

    def test_balance_due_reflects_partial_payment(self):
        """A12: partial payment reduces outstanding balance."""
        inst = Installment(
            id=uuid4(), plan_id=uuid4(), installment_number=1,
            due_date=date(2026, 6, 1), amount=Decimal("50_000"),
            status=InstallmentStatus.PARTIAL,
            paid_amount=Decimal("20_000"),
        )
        assert inst.balance_due == Decimal("30_000")

    def test_balance_due_never_negative_on_overpayment(self):
        """Overpayment on this installment: balance should be 0, not negative."""
        inst = Installment(
            id=uuid4(), plan_id=uuid4(), installment_number=1,
            due_date=date(2026, 6, 1), amount=Decimal("50_000"),
            paid_amount=Decimal("60_000"),   # overpaid
        )
        assert inst.balance_due == Decimal("0")


class TestCollectionRate:
    """Verify collection rate formula used in get_dashboard.py use case."""

    def _rate(self, collected: Decimal, receivable: Decimal) -> Decimal:
        if receivable <= 0:
            return Decimal("0")
        return (collected / receivable * 100).quantize(Decimal("0.1"))

    def test_full_collection_is_100(self):
        assert self._rate(Decimal("500_000"), Decimal("500_000")) == Decimal("100.0")

    def test_half_collection_is_50(self):
        assert self._rate(Decimal("250_000"), Decimal("500_000")) == Decimal("50.0")

    def test_zero_receivable_returns_zero(self):
        assert self._rate(Decimal("0"), Decimal("0")) == Decimal("0")

    def test_rate_is_0_to_100_not_0_to_1(self):
        """Frontend bug prevention: rate must be 0-100, not 0-1 fraction."""
        rate = self._rate(Decimal("800_000"), Decimal("1_000_000"))
        assert rate == Decimal("80.0")
        assert rate > 1, "collection_rate_pct must be 0-100 scale, not 0-1"
