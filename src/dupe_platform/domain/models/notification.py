"""Domain model: Notification."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4


class NotificationChannel(str, Enum):
    WHATSAPP = "whatsapp"   # primary channel [A-WA: Meta Cloud API, account verification pending]
    EMAIL    = "email"      # fallback channel [A-EMAIL: cobros@dupedesa.com via SendGrid]


class NotificationStatus(str, Enum):
    PENDING   = "pending"
    SENT      = "sent"
    DELIVERED = "delivered"
    FAILED    = "failed"
    SKIPPED   = "skipped"   # deduplication: already sent


class NotificationTrigger(str, Enum):
    PRE_DUE_5   = "pre_due_5"      # D-5: reminder before due date
    DUE_TODAY   = "due_today"      # D0:  due date reminder
    OVERDUE_1   = "overdue_1"      # D+1: officer alert
    OVERDUE_6   = "overdue_6"      # D+6: management notification
    OVERDUE_16  = "overdue_16"     # D+16: legal flag
    RECEIPT     = "receipt"        # payment received confirmation


@dataclass
class Notification:
    id: UUID
    installment_id: UUID
    client_id: UUID
    channel: NotificationChannel
    trigger: NotificationTrigger
    recipient: str                  # phone (WA) or email address
    template_key: str               # template name [A-WA: must be pre-approved by Meta]
    template_vars: dict
    status: NotificationStatus = NotificationStatus.PENDING
    sent_at: datetime | None = None
    provider_message_id: str | None = None  # Meta / SendGrid message ID
    error_message: str = ""

    @classmethod
    def create(
        cls,
        installment_id: UUID,
        client_id: UUID,
        channel: NotificationChannel,
        trigger: NotificationTrigger,
        recipient: str,
        template_key: str,
        template_vars: dict,
    ) -> "Notification":
        return cls(
            id=uuid4(),
            installment_id=installment_id,
            client_id=client_id,
            channel=channel,
            trigger=trigger,
            recipient=recipient,
            template_key=template_key,
            template_vars=template_vars,
        )
