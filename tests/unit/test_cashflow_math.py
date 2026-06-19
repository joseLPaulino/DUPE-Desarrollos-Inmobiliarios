"""
Unit tests — Cash flow math invariants.

Invariants:
  1. cumulative_balance[n] = cumulative_balance[n-1] + net_cash_flow[n]
  2. net_cash_flow = income - expenses
  3. sum(breakdown.expenses.*) ≈ expenses total (within float rounding)
  4. sum(breakdown.income.*) ≈ income total
  5. Synthetic data: actual months have realistic income (not all zero)
  6. Expense breakdown percentages: construccion 55%, suelo 15%, etc.
"""
from decimal import Decimal

import pytest

from dupe_platform.integrations.excel_cashflow_parser import (
    _get_synthetic_social, _get_synthetic_tourist,
)


class TestCumulativeBalance:

    def test_cumulative_balance_is_running_sum(self):
        rows = _get_synthetic_social()
        running = 0.0
        for r in rows:
            running += r.net_cash_flow
            assert abs(r.cumulative_balance - running) < 0.01, (
                f"Month {r.month}: cumulative_balance {r.cumulative_balance:.2f} "
                f"≠ running sum {running:.2f}"
            )

    def test_net_cash_flow_equals_income_minus_expenses(self):
        rows = _get_synthetic_social()
        for r in rows:
            expected = r.income - r.expenses
            assert abs(r.net_cash_flow - expected) < 0.01, (
                f"Month {r.month}: net_cash_flow {r.net_cash_flow:.2f} "
                f"≠ income - expenses = {expected:.2f}"
            )


class TestExpenseBreakdown:

    def test_expense_components_sum_to_total(self):
        """breakdown expenses must sum to total expenses (within 1 unit)."""
        rows = _get_synthetic_social()
        for r in rows:
            components = (
                r.exp_construccion + r.exp_suelo + r.exp_tecnicos +
                r.exp_juridico + r.exp_financiero + r.exp_gestion +
                r.exp_comercializacion
            )
            assert abs(components - r.expenses) < 1.0, (
                f"Month {r.month}: breakdown sum {components:.2f} "
                f"≠ expenses {r.expenses:.2f}"
            )

    def test_income_components_sum_to_total_for_actual_months(self):
        """income breakdown must sum to total income for actual months."""
        rows = _get_synthetic_social()
        actual = [r for r in rows if r.is_actual]
        for r in actual:
            components = r.income_separaciones + r.income_entregas + r.income_financiamiento
            assert abs(components - r.income) < 1.0, (
                f"Month {r.month} (actual): income breakdown {components:.2f} "
                f"≠ income {r.income:.2f}"
            )

    def test_construccion_is_largest_expense_component(self):
        """Construcción should be the single largest cost category."""
        rows = _get_synthetic_social()
        expense_months = [r for r in rows if r.expenses > 0]
        for r in expense_months:
            others = [r.exp_suelo, r.exp_tecnicos, r.exp_juridico,
                      r.exp_financiero, r.exp_gestion, r.exp_comercializacion]
            assert r.exp_construccion >= max(others), (
                f"Month {r.month}: exp_construccion {r.exp_construccion:.0f} "
                f"not largest — max other: {max(others):.0f}"
            )


class TestActualMonthIncome:
    """
    Regression test for the bug where all actual months had income=0.
    (Fixed in _get_synthetic_social — income starts from month 0 for actual months.)
    """

    def test_actual_months_have_nonzero_income_total(self):
        rows = _get_synthetic_social()
        actual = [r for r in rows if r.is_actual]
        total_actual_income = sum(r.income for r in actual)
        assert total_actual_income > 0, (
            "All actual months have zero income — seed data bug: "
            "separaciones/entregas/financiamiento not populated for real months"
        )

    def test_some_actual_months_have_separaciones(self):
        rows = _get_synthetic_social()
        actual = [r for r in rows if r.is_actual]
        separaciones_months = [r for r in actual if r.income_separaciones > 0]
        assert len(separaciones_months) > 0, (
            "No actual months have separaciones income — seed data incomplete"
        )

    def test_tourist_project_is_all_projected(self):
        """Tourist project starts Jun 2026 — all months should be projected."""
        rows = _get_synthetic_tourist()
        actual = [r for r in rows if r.is_actual]
        assert len(actual) == 0, (
            f"Tourist project should have 0 actual months, got {len(actual)}"
        )

    def test_social_project_has_21_actual_months(self):
        """Social project started Sep 2024 — 21 months actual before Jun 2026."""
        rows = _get_synthetic_social()
        actual = [r for r in rows if r.is_actual]
        assert len(actual) == 21, (
            f"Social project should have 21 actual months, got {len(actual)}"
        )


class TestBreakdownFieldsPopulated:
    """Regression: breakdown columns must not be all zero (recharts bug surface)."""

    def test_no_expense_month_has_all_zero_components(self):
        rows = _get_synthetic_social()
        for r in rows:
            if r.expenses > 0:
                total_components = (
                    r.exp_construccion + r.exp_suelo + r.exp_tecnicos +
                    r.exp_juridico + r.exp_financiero + r.exp_gestion +
                    r.exp_comercializacion
                )
                assert total_components > 0, (
                    f"Month {r.month} has expenses={r.expenses:.0f} "
                    f"but all component fields are zero"
                )
