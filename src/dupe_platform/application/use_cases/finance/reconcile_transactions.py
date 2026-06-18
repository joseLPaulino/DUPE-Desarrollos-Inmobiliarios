"""Use case: Reconcile uploaded bank statement transactions against budget partidas."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import BinaryIO
from uuid import UUID

from dupe_platform.domain.models import (
    BankTransaction, ReconciliationMatch, ConfidenceLevel,
    ReconciliationStatus,
)
from dupe_platform.domain.ports import (
    TransactionRepository, BudgetRepository, BankStatementParserPort,
)


@dataclass
class ReconciliationResult:
    total_transactions: int = 0
    auto_matched: int = 0       # HIGH confidence — no officer review
    queued_for_review: int = 0  # MEDIUM/LOW — officer exception queue
    unmatched: int = 0
    matches: list[dict] = field(default_factory=list)


# ── Synthetic Rule Store ──────────────────────────────────────────────────────
# [BLOCKED: A-BANK] Real rules built from Banco Popular transaction descriptions.
# These synthetic rules will be replaced once the sample file is received (Day 1).
SYNTHETIC_RULE_STORE: dict[str, str] = {
    "TRANSFERENCIA CONSTRUCCION": "GASTO-001",
    "PAGO PROVEEDORES MATERIALES": "GASTO-002",
    "HONORARIOS PROFESIONALES":    "GASTO-004",
    "RECIBO CUOTA CLIENTE":        "INGRESO-001",
    "PRESTAMO BANCARIO":           "INGRESO-003",
    "GASTOS FINANCIEROS":          "GASTO-006",
    "SALARIOS PERSONAL":           "GASTO-003",
}


class ReconcileTransactionsUseCase:
    def __init__(
        self,
        parser: BankStatementParserPort,
        transaction_repo: TransactionRepository,
        budget_repo: BudgetRepository,
        rule_store: dict[str, str] | None = None,
    ):
        self._parser           = parser
        self._transaction_repo = transaction_repo
        self._budget_repo      = budget_repo
        self._rules            = rule_store or SYNTHETIC_RULE_STORE

    async def execute(
        self, project_id: UUID, file: BinaryIO, filename: str
    ) -> ReconciliationResult:
        result = ReconciliationResult()
        budget = await self._budget_repo.get_by_project(project_id)
        if not budget:
            raise ValueError(f"No budget found for project {project_id}")

        partida_map = {p.code: p.id for p in budget.partidas}

        # 1. Parse the bank statement
        transactions = await self._parser.parse(file, filename)
        result.total_transactions = len(transactions)
        await self._transaction_repo.save_batch(transactions)

        # 2. Score each transaction against rules / partidas
        for tx in transactions:
            match, score, rule_key = self._score(tx, partida_map)
            if match:
                rec = ReconciliationMatch.create(
                    transaction_id=tx.id,
                    partida_id=partida_map[match],
                    confidence_score=score,
                    matched_by="rule_store" if rule_key else "agent",
                    rule_key=rule_key,
                )
                await self._transaction_repo.save_match(rec)

                if rec.confidence == ConfidenceLevel.HIGH:
                    tx.status = ReconciliationStatus.MATCHED
                    result.auto_matched += 1
                else:
                    tx.status = ReconciliationStatus.EXCEPTION
                    result.queued_for_review += 1

                result.matches.append({
                    "transaction_id": str(tx.id),
                    "description": tx.description,
                    "amount": str(tx.amount),
                    "partida_code": match,
                    "confidence": rec.confidence.value,
                    "score": score,
                })
            else:
                tx.status = ReconciliationStatus.UNMATCHED
                result.unmatched += 1

        return result

    def _score(
        self, tx: BankTransaction, partida_map: dict[str, str]
    ) -> tuple[str | None, float, str | None]:
        """Rule-based scoring. Returns (partida_code, score, rule_key)."""
        desc_upper = tx.description.upper()

        # Exact rule match → HIGH confidence
        for keyword, code in self._rules.items():
            if keyword in desc_upper and code in partida_map:
                return code, 0.92, keyword

        # Partial keyword match → MEDIUM
        for keyword, code in self._rules.items():
            words = keyword.split()
            if any(w in desc_upper for w in words) and code in partida_map:
                return code, 0.65, None

        return None, 0.0, None
