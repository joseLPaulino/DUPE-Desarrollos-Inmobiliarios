"""Abstract service ports — messaging, bank parsing, reporting."""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import BinaryIO

from dupe_platform.domain.models import BankTransaction, Notification


class MessagingPort(ABC):
    """
    Sends WhatsApp messages (primary) or email (fallback).
    [A-WA: Meta Cloud API — account verification on critical path]
    [A-EMAIL: SendGrid, cobros@dupedesa.com]
    """
    @abstractmethod
    async def send(self, notification: Notification) -> str:
        """Returns provider message ID."""
        ...

    @abstractmethod
    async def check_delivery(self, provider_message_id: str) -> str:
        """Returns delivery status string."""
        ...


class BankStatementParserPort(ABC):
    """
    Parses Banco Popular CSV/TXT netbanking export into BankTransaction list.
    [BLOCKED: A-BANK — exact CSV columns unknown until sample file received Day 1]
    """
    @abstractmethod
    async def parse(self, file: BinaryIO, filename: str) -> list[BankTransaction]:
        """Parse uploaded bank statement file."""
        ...


class ReportGeneratorPort(ABC):
    """Generates PDF reports and Excel exports."""
    @abstractmethod
    async def generate_weekly_pdf(self, project_id: str) -> bytes: ...
    @abstractmethod
    async def generate_financial_statements(self, project_id: str) -> bytes: ...
