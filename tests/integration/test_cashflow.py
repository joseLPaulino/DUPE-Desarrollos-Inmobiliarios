"""
Integration tests — Cash flow API.

Invariants:
  - GET /cash-flow/{id} returns list with required fields
  - cumulative_balance[n] = cumulative_balance[n-1] + net_cash_flow[n]
  - net_cash_flow = income - expenses (within float tolerance)
  - breakdown.expenses fields sum to expenses total
  - is_actual months precede projected months (no interleaving)
  - Actual months have income > 0 (regression: seed bug where income was 0)
  - breakdown sub-fields are not all zero for months with expenses > 0
"""
import pytest


@pytest.fixture(scope="module")
def cashflow(client, project_id):
    r = client.get(f"/cash-flow/{project_id}")
    assert r.status_code == 200, f"GET /cash-flow/{project_id} failed: {r.text}"
    data = r.json()
    assert len(data) > 0, "Cash flow returned empty list"
    return data


class TestCashFlowStructure:

    def test_required_fields_present(self, cashflow):
        required = {
            "month", "month_number", "is_actual",
            "income", "expenses", "net_cash_flow", "cumulative_balance",
            "breakdown",
        }
        for row in cashflow[:3]:   # spot-check first 3
            missing = required - set(row.keys())
            assert not missing, f"Cash flow month missing fields: {missing}"

    def test_breakdown_structure(self, cashflow):
        """breakdown must have income and expenses sub-objects with correct keys."""
        required_income   = {"separaciones", "entregas", "financiamiento"}
        required_expenses = {"construccion", "suelo", "tecnicos",
                             "juridico", "financiero", "gestion", "comercializacion"}
        for row in cashflow[:3]:
            bd = row["breakdown"]
            assert "income" in bd,   "breakdown.income missing"
            assert "expenses" in bd, "breakdown.expenses missing"
            missing_inc = required_income   - set(bd["income"].keys())
            missing_exp = required_expenses - set(bd["expenses"].keys())
            assert not missing_inc, f"breakdown.income missing keys: {missing_inc}"
            assert not missing_exp, f"breakdown.expenses missing keys: {missing_exp}"

    def test_months_are_sorted_by_month_number(self, cashflow):
        numbers = [r["month_number"] for r in cashflow]
        assert numbers == sorted(numbers), "Cash flow months are not in order"

    def test_actual_months_come_before_projected(self, cashflow):
        """No actual month should appear after a projected one."""
        seen_projected = False
        for row in cashflow:
            if not row["is_actual"]:
                seen_projected = True
            elif seen_projected:
                pytest.fail(
                    f"Actual month {row['month']} appears after projected months — "
                    "is_actual ordering is broken"
                )


class TestCashFlowMath:

    def test_net_cash_flow_equals_income_minus_expenses(self, cashflow):
        for row in cashflow:
            expected = row["income"] - row["expenses"]
            assert abs(row["net_cash_flow"] - expected) < 0.01, (
                f"Month {row['month']}: net={row['net_cash_flow']:.2f} "
                f"≠ income - expenses = {expected:.2f}"
            )

    def test_cumulative_balance_is_running_sum(self, cashflow):
        running = 0.0
        for row in cashflow:
            running += row["net_cash_flow"]
            assert abs(row["cumulative_balance"] - running) < 0.50, (
                f"Month {row['month']}: cumulative={row['cumulative_balance']:.2f} "
                f"≠ running sum {running:.2f}"
            )

    def test_expense_breakdown_sums_to_expenses(self, cashflow):
        for row in cashflow:
            if row["expenses"] == 0:
                continue
            exp = row["breakdown"]["expenses"]
            component_sum = sum(exp.values())
            assert abs(component_sum - row["expenses"]) < 1.0, (
                f"Month {row['month']}: breakdown sum {component_sum:.2f} "
                f"≠ expenses {row['expenses']:.2f}"
            )


class TestActualMonthData:
    """Regression tests for seed data quality."""

    def test_actual_months_exist(self, cashflow):
        actual = [r for r in cashflow if r["is_actual"]]
        assert len(actual) > 0, "No actual months in cash flow — seed data missing"

    def test_actual_months_have_nonzero_income_total(self, cashflow):
        """Regression: old seed had income=0 for all actual months."""
        actual = [r for r in cashflow if r["is_actual"]]
        total_income = sum(r["income"] for r in actual)
        assert total_income > 0, (
            "All actual months have income=0 — seed data bug: "
            "run docker compose down -v && docker compose up --build to reseed"
        )

    def test_breakdown_not_all_zero_for_expense_months(self, cashflow):
        """Regression: old seed left all breakdown fields at 0 even with expenses."""
        for row in cashflow:
            if row["expenses"] <= 0:
                continue
            exp = row["breakdown"]["expenses"]
            total_breakdown = sum(exp.values())
            assert total_breakdown > 0, (
                f"Month {row['month']} has expenses={row['expenses']:.0f} "
                f"but all breakdown fields are zero — recharts will show empty bars"
            )
