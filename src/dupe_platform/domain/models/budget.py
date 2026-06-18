"""Domain model: Budget, Partida (budget line), PartidaExecution."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import Enum
from uuid import UUID, uuid4


class TrafficLight(str, Enum):
    GREEN  = "green"   # execution < 90% of budget
    AMBER  = "amber"   # 90% <= execution < 100%
    RED    = "red"     # execution >= 100%  [BUDGET-GUARD: block at 110% without mgmt override]


class PartidaType(str, Enum):
    INCOME  = "income"
    EXPENSE = "expense"


@dataclass
class Partida:
    """
    A budget line item (partida presupuestaria).
    Income: 5–8 partidas per project.
    Expense: 7 categories with 28–35 sub-partidas.
    [A-COA: chart of accounts TBD — HCLTech proposes DR real estate standard, mgmt approves Week 1]
    """
    id: UUID
    budget_id: UUID
    code: str               # e.g. "GASTO-001", "INGRESO-003"
    name: str
    partida_type: PartidaType
    budgeted_amount: Decimal
    parent_id: UUID | None = None   # for sub-partidas

    @property
    def is_sub_partida(self) -> bool:
        return self.parent_id is not None


@dataclass
class PartidaExecution:
    """Actual spending / income recorded against a partida."""
    id: UUID
    partida_id: UUID
    project_id: UUID
    amount: Decimal
    execution_date: date
    transaction_id: UUID | None = None  # linked bank transaction if reconciled
    description: str = ""
    entered_by: str = "system"


@dataclass
class Budget:
    id: UUID
    project_id: UUID
    version: int = 1
    approved_date: date | None = None
    partidas: list[Partida] = field(default_factory=list)
    executions: list[PartidaExecution] = field(default_factory=list)

    def execution_for(self, partida_id: UUID) -> Decimal:
        return sum(e.amount for e in self.executions if e.partida_id == partida_id)

    def execution_pct(self, partida_id: UUID) -> Decimal:
        partida = next((p for p in self.partidas if p.id == partida_id), None)
        if not partida or partida.budgeted_amount == 0:
            return Decimal("0")
        return (self.execution_for(partida_id) / partida.budgeted_amount * 100).quantize(Decimal("0.1"))

    def traffic_light(self, partida_id: UUID) -> TrafficLight:
        pct = self.execution_pct(partida_id)
        if pct >= 100:
            return TrafficLight.RED
        elif pct >= 90:
            return TrafficLight.AMBER
        return TrafficLight.GREEN

    def over_110_guard(self, partida_id: UUID) -> bool:
        """True if partida is over 110% — requires management override to proceed."""
        return self.execution_pct(partida_id) > Decimal("110")

    @property
    def total_budgeted_expense(self) -> Decimal:
        return sum(p.budgeted_amount for p in self.partidas if p.partida_type == PartidaType.EXPENSE)

    @property
    def total_executed_expense(self) -> Decimal:
        expense_ids = {p.id for p in self.partidas if p.partida_type == PartidaType.EXPENSE}
        return sum(e.amount for e in self.executions if e.partida_id in expense_ids)
