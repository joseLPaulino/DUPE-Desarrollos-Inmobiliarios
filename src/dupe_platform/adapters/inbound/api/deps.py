"""Dependency injection — wires ports to adapters for FastAPI."""
from functools import lru_cache
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from dupe_platform.adapters.outbound.persistence.database import get_db
from dupe_platform.adapters.outbound.persistence.repositories.project_repo import SqlProjectRepository
from dupe_platform.adapters.outbound.persistence.repositories.client_repo import SqlClientRepository
from dupe_platform.adapters.outbound.persistence.repositories.plan_repo import SqlPaymentPlanRepository
from dupe_platform.adapters.outbound.persistence.repositories.transaction_repo import SqlTransactionRepository
from dupe_platform.adapters.outbound.persistence.repositories.budget_repo import SqlBudgetRepository
from dupe_platform.adapters.outbound.persistence.repositories.notification_repo import SqlNotificationRepository
from dupe_platform.adapters.outbound.messaging.synthetic_messaging import SyntheticMessagingAdapter
from dupe_platform.adapters.outbound.banking.synthetic_parser import SyntheticBankStatementParser
from dupe_platform.application.use_cases.finance.get_dashboard import GetDashboardUseCase
from dupe_platform.application.use_cases.finance.reconcile_transactions import ReconcileTransactionsUseCase
from dupe_platform.application.use_cases.collections.create_payment_plan import CreatePaymentPlanUseCase
from dupe_platform.application.use_cases.collections.send_notifications import SendNotificationsUseCase
from dupe_platform.infrastructure.config import get_settings


# ── Repository dependencies ───────────────────────────────────────────────────

async def get_project_repo(db: AsyncSession = Depends(get_db)):
    return SqlProjectRepository(db)

async def get_client_repo(db: AsyncSession = Depends(get_db)):
    return SqlClientRepository(db)

async def get_payment_plan_repo(db: AsyncSession = Depends(get_db)):
    return SqlPaymentPlanRepository(db)

async def get_transaction_repo(db: AsyncSession = Depends(get_db)):
    return SqlTransactionRepository(db)

async def get_budget_repo(db: AsyncSession = Depends(get_db)):
    return SqlBudgetRepository(db)

async def get_notification_repo(db: AsyncSession = Depends(get_db)):
    return SqlNotificationRepository(db)

# ── Service adapters (singletons) ─────────────────────────────────────────────

_messaging = SyntheticMessagingAdapter()   # swap → WhatsAppAdapter / SendGridAdapter
_parser    = SyntheticBankStatementParser() # swap → BancPopularParser

# ── Use case dependencies ─────────────────────────────────────────────────────

async def get_dashboard_use_case(
    project_repo=Depends(get_project_repo),
    budget_repo=Depends(get_budget_repo),
    plan_repo=Depends(get_payment_plan_repo),
):
    return GetDashboardUseCase(project_repo, budget_repo, plan_repo)


async def get_reconcile_use_case(
    transaction_repo=Depends(get_transaction_repo),
    budget_repo=Depends(get_budget_repo),
):
    return ReconcileTransactionsUseCase(_parser, transaction_repo, budget_repo)


async def get_create_plan_use_case(
    project_repo=Depends(get_project_repo),
    client_repo=Depends(get_client_repo),
    plan_repo=Depends(get_payment_plan_repo),
):
    settings = get_settings()
    return CreatePaymentPlanUseCase(
        project_repo, client_repo, plan_repo,
        auto_activate=settings.payment_plan_auto_activate,
    )


async def get_send_notifications_use_case(
    plan_repo=Depends(get_payment_plan_repo),
    client_repo=Depends(get_client_repo),
    notification_repo=Depends(get_notification_repo),
):
    return SendNotificationsUseCase(plan_repo, client_repo, notification_repo, _messaging)
