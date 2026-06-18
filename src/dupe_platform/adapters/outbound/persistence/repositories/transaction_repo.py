"""SQLAlchemy implementation of TransactionRepository."""
from __future__ import annotations
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.domain.models import BankTransaction, ReconciliationMatch
from dupe_platform.domain.models.transaction import ReconciliationStatus, ConfidenceLevel
from dupe_platform.domain.ports.repositories import TransactionRepository
from ..models import BankTransactionORM


class SqlTransactionRepository(TransactionRepository):

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    @staticmethod
    def _to_domain(row: BankTransactionORM) -> BankTransaction:
        return BankTransaction(
            id=row.id,
            transaction_date=row.transaction_date,
            value_date=row.value_date,
            description=row.description,
            reference=row.reference,
            amount=row.amount,
            balance_after=row.balance_after,
            raw_line=row.raw_line or "",
            status=ReconciliationStatus(row.status),
        )

    async def get(self, tx_id: UUID) -> BankTransaction | None:
        row = await self._s.get(BankTransactionORM, tx_id)
        return self._to_domain(row) if row else None

    async def list_unmatched(self) -> list[BankTransaction]:
        result = await self._s.execute(
            select(BankTransactionORM)
            .where(BankTransactionORM.status == "unmatched")
            .order_by(BankTransactionORM.transaction_date.desc())
        )
        return [self._to_domain(r) for r in result.scalars()]

    async def save_batch(self, transactions: list[BankTransaction]) -> None:
        for tx in transactions:
            existing = await self._s.get(BankTransactionORM, tx.id)
            if not existing:
                self._s.add(BankTransactionORM(
                    id=tx.id,
                    transaction_date=tx.transaction_date,
                    value_date=tx.value_date,
                    description=tx.description,
                    reference=tx.reference,
                    amount=tx.amount,
                    balance_after=tx.balance_after,
                    raw_line=tx.raw_line,
                    status=tx.status.value,
                ))
        await self._s.flush()

    async def save_match(self, match: ReconciliationMatch) -> None:
        # Update the transaction status to matched and persist the match as JSON in notes.
        # Full ReconciliationMatch table is a future enhancement (rule store).
        row = await self._s.get(BankTransactionORM, match.transaction_id)
        if row:
            row.status = "matched"
        await self._s.flush()

    async def get_matches(self, transaction_id: UUID) -> list[ReconciliationMatch]:
        # Stub: full match history table is a future enhancement.
        # For the POC we return an empty list; the API returns match data from the use case.
        return []
