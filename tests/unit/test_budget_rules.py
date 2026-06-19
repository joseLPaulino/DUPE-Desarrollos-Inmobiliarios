"""
Unit tests — Budget domain rules.

Architecture invariants (from L1 Architecture doc):
  - TrafficLight: GREEN < 90%, AMBER 90-99.9%, RED ≥ 100%
  - Budget guard: block execution > 110% (returns 422 via API)
  - All domain calculations use Decimal — no float drift
"""
from decimal import Decimal
from uuid import uuid4

import pytest

from dupe_platform.domain.models.budget import (
    Budget, Partida, PartidaExecution, PartidaType, TrafficLight,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_budget(budgeted: Decimal, executed: Decimal) -> tuple[Budget, Partida]:
    """Return a Budget with one expense partida, already executed the given amount."""
    pid = uuid4()
    budget_id = uuid4()
    partida = Partida(
        id=pid,
        budget_id=budget_id,
        code="CONST-001",
        name="Construcción",
        partida_type=PartidaType.EXPENSE,
        budgeted_amount=budgeted,
    )
    budget = Budget(id=budget_id, project_id=uuid4(), version=1)
    budget.partidas.append(partida)
    if executed > 0:
        budget.executions.append(PartidaExecution(
            id=uuid4(), partida_id=pid, project_id=budget.project_id,
            amount=executed, execution_date=__import__('datetime').date.today(),
        ))
    return budget, partida


# ── Traffic Light ─────────────────────────────────────────────────────────────

class TestTrafficLight:
    def test_green_at_zero(self):
        budget, p = make_budget(Decimal("1_000_000"), Decimal("0"))
        assert budget.traffic_light(p.id) == TrafficLight.GREEN

    def test_green_below_90pct(self):
        budget, p = make_budget(Decimal("1_000_000"), Decimal("889_999"))
        assert budget.traffic_light(p.id) == TrafficLight.GREEN

    def test_amber_at_exactly_90pct(self):
        budget, p = make_budget(Decimal("1_000_000"), Decimal("900_000"))
        assert budget.traffic_light(p.id) == TrafficLight.AMBER

    def test_amber_between_90_and_100(self):
        budget, p = make_budget(Decimal("1_000_000"), Decimal("950_000"))
        assert budget.traffic_light(p.id) == TrafficLight.AMBER

    def test_red_at_exactly_100pct(self):
        budget, p = make_budget(Decimal("1_000_000"), Decimal("1_000_000"))
        assert budget.traffic_light(p.id) == TrafficLight.RED

    def test_red_above_100pct(self):
        budget, p = make_budget(Decimal("1_000_000"), Decimal("1_100_001"))
        assert budget.traffic_light(p.id) == TrafficLight.RED

    def test_green_at_89_9pct(self):
        budget, p = make_budget(Decimal("1_000_000"), Decimal("899_999"))
        assert budget.traffic_light(p.id) == TrafficLight.GREEN

    def test_traffic_light_is_lowercase_string(self):
        """Frontend depends on lowercase 'green'/'amber'/'red' — not uppercase."""
        budget, p = make_budget(Decimal("100"), Decimal("0"))
        tl = budget.traffic_light(p.id)
        assert tl.value == tl.value.lower(), f"TrafficLight value must be lowercase, got '{tl.value}'"

    def test_zero_budget_returns_green(self):
        """Edge case: partida with 0 budget should not divide by zero."""
        budget, p = make_budget(Decimal("0"), Decimal("0"))
        assert budget.traffic_light(p.id) == TrafficLight.GREEN


# ── Budget Guard ──────────────────────────────────────────────────────────────

class TestBudgetGuard:
    def test_over_110_guard_triggers(self):
        budget, p = make_budget(Decimal("1_000_000"), Decimal("1_100_001"))
        assert budget.over_110_guard(p.id) is True

    def test_over_110_guard_at_exactly_110pct(self):
        """Exactly 110% — guard should NOT trigger (boundary is exclusive)."""
        budget, p = make_budget(Decimal("1_000_000"), Decimal("1_100_000"))
        assert budget.over_110_guard(p.id) is False

    def test_over_110_guard_clear_at_50pct(self):
        budget, p = make_budget(Decimal("1_000_000"), Decimal("500_000"))
        assert budget.over_110_guard(p.id) is False


# ── Execution Percentage ──────────────────────────────────────────────────────

class TestExecutionPct:
    def test_pct_rounds_to_one_decimal(self):
        budget, p = make_budget(Decimal("1_000_000"), Decimal("333_333"))
        pct = budget.execution_pct(p.id)
        assert pct == Decimal("33.3")

    def test_pct_aggregates_multiple_executions(self):
        pid = uuid4()
        bid = uuid4()
        partida = Partida(
            id=pid, budget_id=bid, code="TEST-001", name="Test",
            partida_type=PartidaType.EXPENSE, budgeted_amount=Decimal("1_000_000"),
        )
        budget = Budget(id=bid, project_id=uuid4())
        budget.partidas.append(partida)
        # Two separate execution entries
        for amt in [Decimal("300_000"), Decimal("200_000")]:
            budget.executions.append(PartidaExecution(
                id=uuid4(), partida_id=pid, project_id=budget.project_id,
                amount=amt, execution_date=__import__('datetime').date.today(),
            ))
        assert budget.execution_pct(pid) == Decimal("50.0")


# ── Total Budget Aggregation ──────────────────────────────────────────────────

class TestTotalBudget:
    def test_only_expense_partidas_count_toward_total(self):
        bid = uuid4()
        pid = uuid4()

        expense = Partida(id=pid, budget_id=bid, code="G-001", name="Gastos",
                          partida_type=PartidaType.EXPENSE, budgeted_amount=Decimal("500_000"))
        income  = Partida(id=uuid4(), budget_id=bid, code="I-001", name="Ingresos",
                          partida_type=PartidaType.INCOME,  budgeted_amount=Decimal("800_000"))

        budget = Budget(id=bid, project_id=uuid4())
        budget.partidas = [expense, income]
        budget.executions.append(PartidaExecution(
            id=uuid4(), partida_id=pid, project_id=budget.project_id,
            amount=Decimal("200_000"), execution_date=__import__('datetime').date.today(),
        ))

        assert budget.total_budgeted_expense == Decimal("500_000")
        assert budget.total_executed_expense  == Decimal("200_000")
