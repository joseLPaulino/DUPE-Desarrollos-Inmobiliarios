"""Use case: Dispatch scheduled notifications (runs daily via scheduler)."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from uuid import UUID

from dupe_platform.domain.models import (
    Notification, NotificationChannel, NotificationStatus, NotificationTrigger,
)
from dupe_platform.domain.ports import (
    ClientRepository, PaymentPlanRepository,
    NotificationRepository, MessagingPort,
)


@dataclass
class NotificationDispatchResult:
    sent: int = 0
    skipped_dedup: int = 0
    failed: int = 0
    details: list[dict] = field(default_factory=list)


class SendNotificationsUseCase:
    """
    Scans payment plans daily and dispatches WhatsApp + email notifications.
    Deduplication: checks notification store before every dispatch.
    [A-WA: primary channel — will be synthetic (log-only) until Meta account verified]
    """
    def __init__(
        self,
        plan_repo: PaymentPlanRepository,
        client_repo: ClientRepository,
        notification_repo: NotificationRepository,
        messaging: MessagingPort,
    ):
        self._plan_repo          = plan_repo
        self._client_repo        = client_repo
        self._notification_repo  = notification_repo
        self._messaging          = messaging

    async def run_daily(self, today: date | None = None) -> NotificationDispatchResult:
        today = today or date.today()
        result = NotificationDispatchResult()

        # D-5 reminders
        due_soon = await self._plan_repo.get_installments_due_soon(days_ahead=5)
        for inst in due_soon:
            await self._dispatch(inst, NotificationTrigger.PRE_DUE_5, today, result)

        # Overdue escalation
        overdue = await self._plan_repo.get_overdue_installments()
        for inst in overdue:
            if inst.days_overdue >= 16:
                trigger = NotificationTrigger.OVERDUE_16
            elif inst.days_overdue >= 6:
                trigger = NotificationTrigger.OVERDUE_6
            else:
                trigger = NotificationTrigger.OVERDUE_1
            await self._dispatch(inst, trigger, today, result)

        return result

    async def _dispatch(self, installment, trigger, today, result):
        # Deduplication guard — mandatory per architecture
        already = await self._notification_repo.already_sent(installment.id, trigger.value)
        if already:
            result.skipped_dedup += 1
            return

        client = await self._client_repo.get(installment.plan_id)  # plan has client_id
        if not client:
            result.failed += 1
            return

        for channel in [NotificationChannel.WHATSAPP, NotificationChannel.EMAIL]:
            recipient = client.phone_whatsapp if channel == NotificationChannel.WHATSAPP else client.email
            notif = Notification.create(
                installment_id=installment.id,
                client_id=client.id,
                channel=channel,
                trigger=trigger,
                recipient=recipient,
                template_key=f"dupe_{trigger.value}_{channel.value}",
                template_vars={
                    "client_name": client.full_name,
                    "amount": str(installment.amount),
                    "due_date": installment.due_date.isoformat(),
                    "days_overdue": installment.days_overdue,
                },
            )
            try:
                provider_id = await self._messaging.send(notif)
                notif.provider_message_id = provider_id
                notif.status = NotificationStatus.SENT
                result.sent += 1
            except Exception as e:
                notif.status = NotificationStatus.FAILED
                notif.error_message = str(e)
                result.failed += 1
            finally:
                await self._notification_repo.save(notif)

            result.details.append({
                "installment_id": str(installment.id),
                "trigger": trigger.value,
                "channel": channel.value,
                "status": notif.status.value,
            })
            # Only try email fallback if WhatsApp succeeded
            if channel == NotificationChannel.WHATSAPP and notif.status != NotificationStatus.SENT:
                continue
            else:
                break
