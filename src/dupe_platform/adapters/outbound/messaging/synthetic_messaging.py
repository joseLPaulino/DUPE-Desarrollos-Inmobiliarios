"""
Synthetic messaging adapter — logs notifications instead of sending real messages.
[BLOCKED: A-WA]  Replace with WhatsAppAdapter once Meta Business Account verified.
[BLOCKED: A-EMAIL] Replace with SendGridAdapter once domain cobros@dupedesa.com configured.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from uuid import uuid4

from dupe_platform.domain.models import Notification, NotificationStatus
from dupe_platform.domain.ports import MessagingPort

logger = logging.getLogger("dupe.messaging.synthetic")


class SyntheticMessagingAdapter(MessagingPort):
    """
    Simulates message delivery by logging to console.
    Every send() returns a synthetic provider ID and succeeds.
    Swap this adapter in the DI container when real credentials are available.
    """

    async def send(self, notification: Notification) -> str:
        provider_id = f"SYNTHETIC-{uuid4().hex[:12].upper()}"
        logger.info(
            "[SYNTHETIC %s] → %s | trigger=%s | recipient=%s | template=%s | vars=%s",
            notification.channel.value.upper(),
            provider_id,
            notification.trigger.value,
            notification.recipient,
            notification.template_key,
            notification.template_vars,
        )
        notification.sent_at = datetime.now(tz=timezone.utc)
        return provider_id

    async def check_delivery(self, provider_message_id: str) -> str:
        logger.info("[SYNTHETIC] delivery check for %s → delivered", provider_message_id)
        return "delivered"
