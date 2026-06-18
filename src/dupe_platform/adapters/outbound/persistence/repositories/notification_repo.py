"""SQLAlchemy implementation of NotificationRepository."""
from __future__ import annotations
import json
from uuid import UUID

from sqlalchemy import select, exists
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.domain.models import Notification
from dupe_platform.domain.models.notification import NotificationChannel, NotificationStatus, NotificationTrigger
from dupe_platform.domain.ports.repositories import NotificationRepository
from ..models import NotificationORM


class SqlNotificationRepository(NotificationRepository):

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    @staticmethod
    def _to_domain(row: NotificationORM) -> Notification:
        try:
            tvars = json.loads(row.template_vars or "{}")
        except (ValueError, TypeError):
            tvars = {}
        return Notification(
            id=row.id,
            installment_id=row.installment_id,
            client_id=row.client_id,
            channel=NotificationChannel(row.channel),
            trigger=NotificationTrigger(row.trigger),
            recipient=row.recipient,
            template_key=row.template_key,
            template_vars=tvars,
            status=NotificationStatus(row.status),
            sent_at=row.sent_at,
            provider_message_id=row.provider_message_id,
            error_message=row.error_message or "",
        )

    async def save(self, notification: Notification) -> None:
        existing = await self._s.get(NotificationORM, notification.id)
        if existing:
            existing.status = notification.status.value
            existing.sent_at = notification.sent_at
            existing.provider_message_id = notification.provider_message_id
            existing.error_message = notification.error_message
        else:
            self._s.add(NotificationORM(
                id=notification.id,
                installment_id=notification.installment_id,
                client_id=notification.client_id,
                channel=notification.channel.value,
                trigger=notification.trigger.value,
                recipient=notification.recipient,
                template_key=notification.template_key,
                template_vars=json.dumps(notification.template_vars),
                status=notification.status.value,
                sent_at=notification.sent_at,
                provider_message_id=notification.provider_message_id,
                error_message=notification.error_message,
            ))
        await self._s.flush()

    async def already_sent(self, installment_id: UUID, trigger: str) -> bool:
        """Deduplication guard — true if a successful notification was already sent."""
        result = await self._s.execute(
            select(
                exists().where(
                    NotificationORM.installment_id == installment_id,
                    NotificationORM.trigger == trigger,
                    NotificationORM.status.in_(["sent", "delivered"]),
                )
            )
        )
        return result.scalar()

    async def list_by_client(self, client_id: UUID) -> list[Notification]:
        result = await self._s.execute(
            select(NotificationORM)
            .where(NotificationORM.client_id == client_id)
            .order_by(NotificationORM.created_at.desc())
        )
        return [self._to_domain(r) for r in result.scalars()]
