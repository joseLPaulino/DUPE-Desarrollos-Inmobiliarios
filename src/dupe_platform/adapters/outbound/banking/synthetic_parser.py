"""
Synthetic bank statement parser.
[BLOCKED: A-BANK] Real parser requires a Banco Popular CSV/TXT sample (Day 1).
This adapter returns synthetic transactions for demo purposes.
"""
from __future__ import annotations
import csv
import io
import logging
import random
from datetime import date, timedelta
from decimal import Decimal
from typing import BinaryIO
from uuid import uuid4

from dupe_platform.domain.models import BankTransaction
from dupe_platform.domain.ports import BankStatementParserPort

logger = logging.getLogger("dupe.banking.synthetic")

# Synthetic transaction descriptions matching SYNTHETIC_RULE_STORE keywords
SYNTHETIC_DESCRIPTIONS = [
    ("TRANSFERENCIA CONSTRUCCION FASE 1",  Decimal("-850000.00")),
    ("PAGO PROVEEDORES MATERIALES ACERO",  Decimal("-320000.00")),
    ("HONORARIOS PROFESIONALES ARQTOS",    Decimal("-95000.00")),
    ("RECIBO CUOTA CLIENTE 001",           Decimal("185000.00")),
    ("RECIBO CUOTA CLIENTE 002",           Decimal("185000.00")),
    ("PRESTAMO BANCARIO BHD DESEMBOLSO",   Decimal("2500000.00")),
    ("GASTOS FINANCIEROS INTERESES BHD",   Decimal("-45000.00")),
    ("SALARIOS PERSONAL OBRA JUNIO",       Decimal("-280000.00")),
    ("COMPRA CEMENTO PROVEEDOR XYZ",       Decimal("-125000.00")),  # LOW confidence — no rule match
    ("DEPOSITO VARIOS",                    Decimal("50000.00")),    # LOW confidence — no rule match
]


class SyntheticBankStatementParser(BankStatementParserPort):
    """
    Accepts either:
    - A real CSV file (tries synthetic column mapping)
    - An empty/dummy file → generates synthetic transactions for demo

    [BLOCKED: A-BANK] Column names are ASSUMED as: fecha, descripcion, referencia, debito, credito, balance
    Replace column mapping once Banco Popular sample is received.
    """

    async def parse(self, file: BinaryIO, filename: str) -> list[BankTransaction]:
        content = file.read()
        if not content.strip():
            logger.warning("[SYNTHETIC] Empty file — generating synthetic transactions for demo")
            return self._generate_synthetic(count=10)

        try:
            text = content.decode("utf-8-sig")  # handle BOM
            return self._parse_csv(text)
        except Exception as e:
            logger.warning("[SYNTHETIC] CSV parse failed (%s) — falling back to synthetic data", e)
            return self._generate_synthetic(count=10)

    def _parse_csv(self, text: str) -> list[BankTransaction]:
        transactions = []
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            try:
                tx = BankTransaction.from_csv_row(row)
                transactions.append(tx)
            except Exception as e:
                logger.warning("[SYNTHETIC] Skipping malformed row: %s — %s", row, e)
        logger.info("[SYNTHETIC] Parsed %d transactions from CSV", len(transactions))
        return transactions

    def _generate_synthetic(self, count: int = 10) -> list[BankTransaction]:
        today = date.today()
        balance = Decimal("5000000.00")
        transactions = []
        items = random.sample(SYNTHETIC_DESCRIPTIONS, min(count, len(SYNTHETIC_DESCRIPTIONS)))
        for i, (desc, amount) in enumerate(items):
            balance += amount
            tx = BankTransaction(
                id=uuid4(),
                transaction_date=today - timedelta(days=count - i),
                value_date=today - timedelta(days=count - i),
                description=desc,
                reference=f"REF-SYNTH-{i:04d}",
                amount=amount,
                balance_after=balance,
                raw_line=f"SYNTHETIC|{desc}|{amount}",
            )
            transactions.append(tx)
        logger.info("[SYNTHETIC] Generated %d synthetic transactions", len(transactions))
        return transactions
