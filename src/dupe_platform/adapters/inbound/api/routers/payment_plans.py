"""Collections — payment plans router."""
from __future__ import annotations
from uuid import UUID, uuid4
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.outbound.persistence.database import get_db
from dupe_platform.adapters.outbound.persistence.models import InstallmentORM

from dupe_platform.application.use_cases.collections.create_payment_plan import (
    CreatePaymentPlanCommand, CreatePaymentPlanUseCase,
)
from dupe_platform.domain.ports import PaymentPlanRepository
from dupe_platform.adapters.inbound.api.deps import (
    get_payment_plan_repo, get_create_plan_use_case,
)

router = APIRouter()


class PayInstallmentRequest(BaseModel):
    paid_amount: float
    paid_date: str        # ISO date "YYYY-MM-DD"
    notes: Optional[str] = None


class CreatePlanRequest(BaseModel):
    client_id: UUID
    unit_id: UUID
    project_id: UUID
    sale_date: date
    sale_price: Decimal
    num_installments: int = 12


@router.get("/all")
async def list_all_plans(
    db: AsyncSession = Depends(get_db),
):
    """Return all payment plans across all projects — used by the mora calculator."""
    from dupe_platform.adapters.outbound.persistence.models import (
        PaymentPlanORM, ClientORM, ProjectORM,
    )
    result = await db.execute(select(PaymentPlanORM).order_by(PaymentPlanORM.sale_date.desc()))
    plans = list(result.scalars().all())

    enriched = []
    for p in plans:
        client = await db.get(ClientORM, p.client_id)
        project = await db.get(ProjectORM, p.project_id)
        enriched.append({
            "id": str(p.id),
            "client_name": f"{client.first_name} {client.last_name}" if client else "—",
            "project_name": project.name if project else "—",
            "status": "Activo" if p.is_active else "Inactivo",
            "total_amount": float(p.total_amount),
        })
    return enriched


@router.post("/")
async def create_payment_plan(
    body: CreatePlanRequest,
    use_case: CreatePaymentPlanUseCase = Depends(get_create_plan_use_case),
):
    cmd = CreatePaymentPlanCommand(**body.model_dump())
    result = await use_case.execute(cmd)
    plan = result.plan
    return {
        "plan_id": str(plan.id),
        "requires_approval": result.requires_approval,
        "is_active": plan.is_active,
        "total_amount": str(plan.total_amount),
        "installments": [
            {
                "number": i.installment_number,
                "due_date": i.due_date.isoformat(),
                "amount": str(i.amount),
                "status": i.status.value,
            }
            for i in plan.installments
        ],
    }


@router.get("/project/{project_id}")
async def list_plans_by_project(
    project_id: UUID,
    repo: PaymentPlanRepository = Depends(get_payment_plan_repo),
    db: AsyncSession = Depends(get_db),
):
    from dupe_platform.adapters.outbound.persistence.models import ClientORM, UnitORM
    plans = await repo.list_by_project(project_id)

    # Batch-load clients and units for display
    client_ids = list({p.client_id for p in plans})
    unit_ids   = list({p.unit_id   for p in plans})
    clients_map: dict = {}
    units_map:   dict = {}
    for cid in client_ids:
        c = await db.get(ClientORM, cid)
        if c:
            clients_map[cid] = f"{c.first_name} {c.last_name}"
    for uid in unit_ids:
        u = await db.get(UnitORM, uid)
        if u:
            units_map[uid] = u.unit_number

    return [
        {
            "id": str(p.id),
            "client_id": str(p.client_id),
            "client_name": clients_map.get(p.client_id, "—"),
            "unit_id": str(p.unit_id),
            "unit_number": units_map.get(p.unit_id, "—"),
            "project_id": str(p.project_id),
            "sale_date": p.sale_date.isoformat(),
            "total_amount": str(p.total_amount),
            "total_paid": str(p.total_paid),
            "total_balance": str(p.total_balance),
            "is_active": p.is_active,
            "status": "ACTIVE" if p.is_active else "PENDING_APPROVAL",
            "installment_count": len(p.installments),
            "overdue_count": len(p.overdue_installments),
            "legal_flagged": p.legal_flagged,
            "legal_flagged_at": p.legal_flagged_at.isoformat() if p.legal_flagged_at else None,
        }
        for p in plans
    ]


@router.get("/{plan_id}/installments")
async def get_plan_installments(
    plan_id: UUID,
    repo: PaymentPlanRepository = Depends(get_payment_plan_repo),
    db: AsyncSession = Depends(get_db),
):
    """Return full installment breakdown for a plan, including client contact info and notification history."""
    from dupe_platform.adapters.outbound.persistence.models import ClientORM, NotificationORM
    plan = await repo.get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    client = await db.get(ClientORM, plan.client_id)

    # Load all notifications for this plan's installments in one query
    inst_ids = [i.id for i in plan.installments]
    notif_rows = (await db.execute(
        select(NotificationORM)
        .where(NotificationORM.installment_id.in_(inst_ids))
        .order_by(NotificationORM.sent_at.desc())
    )).scalars().all()

    # Build per-installment, per-channel notification history
    # Structure: { inst_id: { "whatsapp": {...}, "email": {...} } }
    notif_map: dict[str, dict] = {}
    for n in notif_rows:
        key = str(n.installment_id)
        if key not in notif_map:
            notif_map[key] = {}
        ch = n.channel
        if ch not in notif_map[key]:  # keep only the most recent (rows sorted desc)
            notif_map[key][ch] = {
                "last_sent_at": n.sent_at.isoformat() if n.sent_at else None,
                "count": 0,  # will sum below
                "notification_id": str(n.id),
            }

    # Count total sends per installment+channel
    for n in notif_rows:
        key = str(n.installment_id)
        ch = n.channel
        if key in notif_map and ch in notif_map[key]:
            notif_map[key][ch]["count"] += 1

    now_utc = datetime.now(timezone.utc)

    def _notif_summary(inst_id: str) -> dict:
        hist = notif_map.get(inst_id, {})
        result = {}
        for ch in ("whatsapp", "email"):
            entry = hist.get(ch)
            if entry:
                last = entry["last_sent_at"]
                # Check if sent within the last 24 hours
                recently = False
                hours_ago = None
                if last:
                    try:
                        last_dt = datetime.fromisoformat(last)
                        if last_dt.tzinfo is None:
                            last_dt = last_dt.replace(tzinfo=timezone.utc)
                        diff = now_utc - last_dt
                        hours_ago = round(diff.total_seconds() / 3600, 1)
                        recently = diff.total_seconds() < 86400  # 24 hours
                    except Exception:
                        pass
                result[ch] = {
                    "last_sent_at": last,
                    "count": entry["count"],
                    "recently_sent": recently,
                    "hours_ago": hours_ago,
                }
            else:
                result[ch] = {"last_sent_at": None, "count": 0, "recently_sent": False, "hours_ago": None}
        return result

    return {
        "plan_id": str(plan.id),
        "client_id": str(plan.client_id),
        "client_name": f"{client.first_name} {client.last_name}" if client else "—",
        "client_email": client.email if client else "",
        "client_phone": client.phone_whatsapp if client else "",
        "total_amount": str(plan.total_amount),
        "total_paid": str(plan.total_paid),
        "total_balance": str(plan.total_balance),
        "installments": [
            {
                "id": str(i.id),
                "number": i.installment_number,
                "due_date": i.due_date.isoformat(),
                "amount": str(i.amount),
                "status": i.status.value,
                "paid_date": i.paid_date.isoformat() if i.paid_date else None,
                "paid_amount": str(i.paid_amount) if i.paid_amount else None,
                "days_overdue": i.days_overdue,
                "escalation_level": i.escalation_level.value,
                "notes": i.notes,
                "notifications": _notif_summary(str(i.id)),
            }
            for i in sorted(plan.installments, key=lambda x: x.installment_number)
        ],
    }


@router.patch("/{plan_id}/approve")
async def approve_plan(
    plan_id: UUID,
    approved_by: str,
    repo: PaymentPlanRepository = Depends(get_payment_plan_repo),
    db: AsyncSession = Depends(get_db),
):
    """
    Approve a payment plan — activates it for monitoring.
    [A-APPROVAL: approver role TBD — any authenticated user for now]
    """
    plan = await repo.get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    plan.is_active = True
    plan.approved_by = approved_by
    await repo.save(plan)

    # ── Activity log ──────────────────────────────────────────────────────────
    from dupe_platform.adapters.outbound.persistence.models import PlanActivityORM
    import json as _json
    try:
        db.add(PlanActivityORM(
            id=uuid4(),
            plan_id=plan_id,
            action_type="plan_approved",
            channel="system",
            actor=approved_by,
            description=f"Plan de pago aprobado por {approved_by}. Ahora activo para monitoreo.",
            metadata_json=_json.dumps({"approved_by": approved_by}, ensure_ascii=False),
            related_entity_id=str(plan_id),
        ))
        await db.commit()
    except Exception:
        await db.rollback()

    return {"plan_id": str(plan_id), "approved_by": approved_by, "is_active": True}


@router.post("/installment/{installment_id}/notify")
async def simulate_notify_installment(
    installment_id: UUID,
    channel: str = "whatsapp",   # "whatsapp" | "email"
    db: AsyncSession = Depends(get_db),
):
    """
    Simulate sending a payment reminder for a specific installment.
    In production this calls WhatsApp / SendGrid. For MVP it logs and returns a receipt.
    """
    from dupe_platform.adapters.outbound.persistence.models import (
        InstallmentORM, PaymentPlanORM, ClientORM, NotificationORM,
    )
    import json
    from sqlalchemy.orm import selectinload

    inst = await db.get(InstallmentORM, installment_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Installment not found")

    # ── Dedup check: find last notification for this installment + channel ────
    last_notif_row = (await db.execute(
        select(NotificationORM)
        .where(
            NotificationORM.installment_id == installment_id,
            NotificationORM.channel == channel,
        )
        .order_by(NotificationORM.sent_at.desc())
        .limit(1)
    )).scalar_one_or_none()

    recently_sent = False
    last_sent_at_iso: str | None = None
    hours_ago: float | None = None
    total_sent_count = 0

    if last_notif_row and last_notif_row.sent_at:
        last_dt = last_notif_row.sent_at
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        diff = datetime.now(timezone.utc) - last_dt
        hours_ago = round(diff.total_seconds() / 3600, 1)
        recently_sent = diff.total_seconds() < 86400  # within 24 hours
        last_sent_at_iso = last_notif_row.sent_at.isoformat()
        # Count total sends for this installment+channel
        count_row = await db.execute(
            select(NotificationORM)
            .where(
                NotificationORM.installment_id == installment_id,
                NotificationORM.channel == channel,
            )
        )
        total_sent_count = len(count_row.scalars().all())

    plan_result = await db.execute(
        select(PaymentPlanORM)
        .where(PaymentPlanORM.id == inst.plan_id)
    )
    plan = plan_result.scalar_one_or_none()
    client = await db.get(ClientORM, plan.client_id) if plan else None

    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    trigger = "overdue_reminder" if inst.days_overdue > 0 else "pre_due_reminder"
    recipient = client.phone_whatsapp if channel == "whatsapp" else client.email
    client_name = f"{client.first_name} {client.last_name}"

    # ── Build message drafts ──────────────────────────────────────────────────
    due_str = inst.due_date.strftime("%d de %B de %Y")
    amount_fmt = f"RD${float(inst.amount):,.0f}" if str(inst.amount).replace(".", "").isdigit() else str(inst.amount)

    if inst.days_overdue > 0:
        whatsapp_body = (
            f"Estimado/a *{client_name}*, le recordamos que la cuota *#{inst.installment_number}* "
            f"de su plan de pago con DUPE Desarrollos Inmobiliarios, por un monto de *{amount_fmt}*, "
            f"venció el *{due_str}* y tiene *{inst.days_overdue} día(s) de atraso*.\n\n"
            f"Le solicitamos regularizar su pago a la brevedad posible para evitar recargos "
            f"y mantener su historial de crédito en buen estado.\n\n"
            f"Para coordinar su pago, comuníquese con su oficial de cobros o responda este mensaje.\n\n"
            f"_DUPE Desarrollos Inmobiliarios · Cobros_"
        )
        email_subject = f"Cuota Vencida #{inst.installment_number} — DUPE Desarrollos Inmobiliarios"
        email_body = (
            f"Estimado/a {client_name},\n\n"
            f"Le comunicamos que la cuota #{inst.installment_number} de su plan de pago, "
            f"correspondiente al monto de {amount_fmt}, venció el {due_str} "
            f"y registra {inst.days_overdue} día(s) de atraso.\n\n"
            f"Le solicitamos realizar el pago a la brevedad para evitar cargos adicionales.\n\n"
            f"Si ya realizó su pago, por favor ignore este mensaje y contáctenos para registrarlo en el sistema.\n\n"
            f"Para cualquier consulta, comuníquese con nosotros por este correo o al número de cobros.\n\n"
            f"Atentamente,\n"
            f"Departamento de Cobros\n"
            f"DUPE Desarrollos Inmobiliarios\n"
            f"cobros@dupedesa.com"
        )
    else:
        whatsapp_body = (
            f"Estimado/a *{client_name}*, le recordamos que la cuota *#{inst.installment_number}* "
            f"de su plan de pago con DUPE Desarrollos Inmobiliarios, por un monto de *{amount_fmt}*, "
            f"tiene fecha de vencimiento el *{due_str}*.\n\n"
            f"Le invitamos a realizar su pago puntualmente para mantener su historial en buen estado.\n\n"
            f"Para coordinar su pago, comuníquese con su oficial de cobros o responda este mensaje.\n\n"
            f"_DUPE Desarrollos Inmobiliarios · Cobros_"
        )
        email_subject = f"Recordatorio de Pago — Cuota #{inst.installment_number} — DUPE Desarrollos Inmobiliarios"
        email_body = (
            f"Estimado/a {client_name},\n\n"
            f"Le recordamos que la cuota #{inst.installment_number} de su plan de pago, "
            f"por un monto de {amount_fmt}, vence el {due_str}.\n\n"
            f"Le invitamos a realizar su pago puntualmente para mantener su historial en buen estado "
            f"y evitar cargos por mora.\n\n"
            f"Si tiene alguna consulta sobre su plan de pago, no dude en contactarnos.\n\n"
            f"Atentamente,\n"
            f"Departamento de Cobros\n"
            f"DUPE Desarrollos Inmobiliarios\n"
            f"cobros@dupedesa.com"
        )

    # Log the notification attempt + plan activity — wrapped so a DB hiccup never blocks the draft
    notif_id = uuid4()
    try:
        from dupe_platform.adapters.outbound.persistence.models import PlanActivityORM
        import json as _json
        db.add(PlanActivityORM(
            id=uuid4(),
            plan_id=inst.plan_id,
            action_type="notification_sent",
            channel=channel,
            actor="officer",
            description=f"Borrador {'WhatsApp' if channel == 'whatsapp' else 'Email'} preparado — cuota #{inst.installment_number}. {'Vencida D+' + str(inst.days_overdue) if inst.days_overdue > 0 else 'Recordatorio preventivo'}.",
            metadata_json=_json.dumps({"installment_number": inst.installment_number,
                                       "days_overdue": inst.days_overdue, "channel": channel,
                                       "recipient": recipient}, ensure_ascii=False),
            related_entity_id=str(notif_id),
        ))
        db.add(NotificationORM(
            id=notif_id,
            installment_id=installment_id,
            client_id=client.id,
            channel=channel,
            trigger=trigger,
            recipient=recipient,
            template_key=f"{trigger}_{channel}",
            template_vars=json.dumps({
                "client_name": client_name,
                "amount": str(inst.amount),
                "due_date": inst.due_date.isoformat(),
                "days_overdue": inst.days_overdue,
            }),
            status="draft",
            sent_at=datetime.now(timezone.utc),
            provider_message_id=f"DRAFT-{notif_id.hex[:12]}",
        ))
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()

    return {
        "notification_id": str(notif_id),
        "channel": channel,
        "recipient": recipient,
        "client_name": client_name,
        "trigger": trigger,
        "status": "draft",
        "draft_whatsapp_message": whatsapp_body,
        "draft_email_subject": email_subject,
        "draft_email_body": email_body,
        "client_email": client.email,
        "client_phone": client.phone_whatsapp,
        "installment_number": inst.installment_number,
        "due_date": inst.due_date.isoformat(),
        "amount": str(inst.amount),
        # Dedup info — frontend uses this to show the warning
        "recently_sent": recently_sent,
        "last_sent_at": last_sent_at_iso,
        "hours_ago": hours_ago,
        "total_sent_count": total_sent_count + 1,  # +1 for the one just logged
    }


@router.patch("/installment/{installment_id}/pay")
async def pay_installment(
    installment_id: UUID,
    body: PayInstallmentRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a payment on a specific installment.
    Marks the installment as 'paid' and records the amount and date.
    """
    inst = await db.get(InstallmentORM, installment_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Installment not found")
    if inst.status == "paid":
        raise HTTPException(status_code=409, detail="Installment already paid")

    inst.paid_amount = Decimal(str(body.paid_amount))
    inst.paid_date = date.fromisoformat(body.paid_date)
    inst.status = "paid"
    if body.notes:
        inst.notes = body.notes

    # ── Activity log ──────────────────────────────────────────────────────────
    from dupe_platform.adapters.outbound.persistence.models import PlanActivityORM
    import json as _json
    db.add(PlanActivityORM(
        id=uuid4(),
        plan_id=inst.plan_id,
        action_type="payment_registered",
        channel="system",
        actor="officer",
        description=f"Pago registrado — cuota #{inst.installment_number}. Monto: {float(body.paid_amount):,.2f}. Fecha pago: {body.paid_date}.",
        metadata_json=_json.dumps({
            "installment_number": inst.installment_number,
            "paid_amount": float(body.paid_amount),
            "paid_date": body.paid_date,
            "notes": body.notes,
        }, ensure_ascii=False),
        related_entity_id=str(installment_id),
    ))

    await db.flush()
    await db.commit()

    # Fetch the parent plan to return updated totals
    from dupe_platform.adapters.outbound.persistence.models import PaymentPlanORM
    from sqlalchemy.orm import selectinload
    plan_result = await db.execute(
        select(PaymentPlanORM)
        .options(selectinload(PaymentPlanORM.installments))
        .where(PaymentPlanORM.id == inst.plan_id)
    )
    plan = plan_result.scalar_one_or_none()

    total_paid = sum(
        i.paid_amount or Decimal("0")
        for i in (plan.installments if plan else [])
        if i.status == "paid"
    )
    total_balance = (plan.total_amount - total_paid) if plan else Decimal("0")

    return {
        "installment_id": str(installment_id),
        "plan_id": str(inst.plan_id),
        "installment_number": inst.installment_number,
        "status": inst.status,
        "paid_amount": float(inst.paid_amount),
        "paid_date": inst.paid_date.isoformat(),
        "plan_total_paid": float(total_paid),
        "plan_balance": float(total_balance),
    }


@router.get("/overdue")
async def get_overdue(
    repo: PaymentPlanRepository = Depends(get_payment_plan_repo),
    db: AsyncSession = Depends(get_db),
):
    from dupe_platform.adapters.outbound.persistence.models import ClientORM, PaymentPlanORM
    installments = await repo.get_overdue_installments()

    # Enrich with client name + legal flag from plan
    enriched = []
    plan_cache: dict = {}
    client_cache: dict = {}
    for i in installments:
        pid = i.plan_id
        if pid not in plan_cache:
            plan_cache[pid] = await db.get(PaymentPlanORM, pid)
        plan = plan_cache.get(pid)

        cid = plan.client_id if plan else None
        if cid and cid not in client_cache:
            client_cache[cid] = await db.get(ClientORM, cid)
        client = client_cache.get(cid) if cid else None

        enriched.append({
            "id": str(i.id),
            "plan_id": str(i.plan_id),
            "installment_number": i.installment_number,
            "due_date": i.due_date.isoformat(),
            "days_overdue": i.days_overdue,
            "amount_due": str(i.amount),
            "balance_due": str(i.balance_due),
            "escalation_level": i.escalation_level.value.upper(),
            "client_name": f"{client.first_name} {client.last_name}" if client else "—",
            "client_phone": client.phone_whatsapp if client else "",
            "client_email": client.email if client else "",
            "legal_flagged": plan.legal_flagged if plan else False,
            "legal_flagged_at": plan.legal_flagged_at.isoformat() if plan and plan.legal_flagged_at else None,
        })
    return enriched
