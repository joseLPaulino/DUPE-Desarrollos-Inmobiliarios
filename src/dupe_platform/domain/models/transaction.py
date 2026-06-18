"""Domain model: BankTransaction and ReconciliationMatch."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import Enum
from uuid import UUID, uuid4


class ConfidenceLevel(str, Enum):
    HIGH   = "high"    # auto-matched, no officer review needed
    MEDIUM = "medium"  # officer review recommended
    LOW    = "low"     # officer review required


class ReconciliationStatus(str, Enum):
    UNMATCHED = "unmatched"
    MATCHED   = "matched"
    EXCEPTION = "exception"   # in officer review queue
    REJECTED  = "rejected"    # officer marked as not reconcilable


@dataclass
class BankTransaction:
    """
    Parsed from Banco Popular CSV/TXT netbanking export.
    [A-BANK: exact CSV columns TBD — sample file needed Day 1]
    """
    id: UUID
    transaction_date: date
    value_date: date
    description: str
    reference: str
    amount: Decimal              # positive = credit, negative = debit
    balance_after: Decimal
    raw_line: str = ""
    status: ReconciliationStatus = ReconciliationStatus.UNMATCHED

    @classmethod
    def from_csv_row(cls, row: dict) -> "BankTransaction":
        """
        [BLOCKED: A-BANK] Real column mapping depends on Banco Popular format.
        Using synthetic column names until sample file is provided.
        Synthetic columns: fecha, descripcion, referencia, debito, credito, balance
        """
        from datetime import datetime
        debit  = Decimal(row.get("debito",  "0").replace(",", "") or "0")
        credit = Decimal(row.get("credito", "0").replace(",", "") or "0")
        amount = credit - debit
        return cls(
            id=uuid4(),
            transaction_date=datetime.strptime(row["fecha"], "%d/%m/%Y").date(),
            value_date=datetime.strptime(row["fecha"], "%d/%m/%Y").date(),
            description=row.get("descripcion", ""),
            reference=row.get("referencia", ""),
            amount=amount,
            balance_after=Decimal(row.get("balance", "0").replace(",", "") or "0"),
            raw_line=str(row),
        )


@dataclass
class ReconciliationMatch:
    """Result of the Reconciliation Agent matching a transaction to a partida."""
    id: UUID
    transaction_id: UUID
    partida_id: UUID
    confidence: ConfidenceLevel
    confidence_score: float          # 0.0 – 1.0
    matched_by: str                  # "rule_store" | "agent" | "officer:<name>"
    rule_key: str | None = None      # key in rule store if matched by rule
    officer_note: str = ""

    @classmethod
    def create(
        cls,
        transaction_id: UUID,
        partida_id: UUID,
        confidence_score: float,
        matched_by: str = "agent",
        rule_key: str | None = None,
    ) -> "ReconciliationMatch":
        if confidence_score >= 0.85:
            level = ConfidenceLevel.HIGH
        elif confidence_score >= 0.55:
            level = ConfidenceLevel.MEDIUM
        else:
            level = ConfidenceLevel.LOW
        return cls(
            id=uuid4(),
            transaction_id=transaction_id,
            partida_id=partida_id,
            confidence=level,
            confidence_score=confidence_score,
            matched_by=matched_by,
            rule_key=rule_key,
        )
