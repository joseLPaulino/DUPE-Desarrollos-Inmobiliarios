"""Notifications router — trigger daily dispatch, view log."""
from fastapi import APIRouter, Depends
from datetime import date

from dupe_platform.application.use_cases.collections.send_notifications import (
    SendNotificationsUseCase,
)
from dupe_platform.adapters.inbound.api.deps import get_send_notifications_use_case

router = APIRouter()


@router.post("/dispatch")
async def dispatch_notifications(
    run_date: date | None = None,
    use_case: SendNotificationsUseCase = Depends(get_send_notifications_use_case),
):
    """
    Trigger daily notification dispatch.
    In production this will be called by the scheduler (APScheduler / cron).
    [BLOCKED: A-WA] Uses SyntheticMessagingAdapter — logs only, no real WA/email.
    """
    result = await use_case.run_daily(today=run_date)
    return {
        "run_date": (run_date or date.today()).isoformat(),
        "sent": result.sent,
        "skipped_dedup": result.skipped_dedup,
        "failed": result.failed,
        "details": result.details,
    }
