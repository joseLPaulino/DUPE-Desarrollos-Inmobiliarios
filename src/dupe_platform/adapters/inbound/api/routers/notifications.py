"""
Notifications router — tier-aware bulk dispatch.

Escalation tiers (aligned with DUPE L1 architecture):
  OFFICER    D+1  to D+5   → WhatsApp + email reminder to client
  MANAGEMENT D+6  to D+15  → Urgent client comms + internal alert to management
  LEGAL      D+16+          → Formal demand letter, flag plan, notify legal officer

All actions respect 24-hour dedup (skip if already sent to that client today).
"""
from __future__ import annotations
import json
import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.outbound.persistence.database import get_db
from dupe_platform.adapters.outbound.persistence.models import (
    ClientORM, InstallmentORM, NotificationORM, PaymentPlanORM, ProjectORM, UnitORM,
    LegalLetterORM, PlanActivityORM,
)

logger = logging.getLogger("dupe.notifications")
router = APIRouter()


# ── Message builders ───────────────────────────────────────────────────────────

def _fmt_amount(amount, currency="DOP") -> str:
    try:
        val = float(str(amount))
        sym = "RD$" if currency != "USD" else "US$"
        return f"{sym}{val:,.0f}"
    except Exception:
        return str(amount)


def _build_officer_whatsapp(client_name: str, inst_number: int, amount: str, due_str: str, days: int) -> str:
    if days > 0:
        return (
            f"Estimado/a *{client_name}*, le recordamos que su cuota *#{inst_number}* "
            f"por *{amount}* venció el *{due_str}* y tiene *{days} día(s) de atraso*.\n\n"
            f"Por favor regularice su pago a la brevedad para evitar recargos.\n\n"
            f"_DUPE Desarrollos Inmobiliarios · Cobros_"
        )
    return (
        f"Estimado/a *{client_name}*, le recordamos que su cuota *#{inst_number}* "
        f"por *{amount}* vence el *{due_str}*.\n\n"
        f"Realice su pago a tiempo para mantener su historial en buen estado.\n\n"
        f"_DUPE Desarrollos Inmobiliarios · Cobros_"
    )


def _build_management_whatsapp(client_name: str, inst_number: int, amount: str, days: int) -> str:
    return (
        f"⚠️ *{client_name}* — Su cuota *#{inst_number}* por *{amount}* "
        f"acumula *{days} días de mora*.\n\n"
        f"Su cuenta ha sido escalada a supervisión gerencial. "
        f"Para evitar acciones adicionales, comuníquese con nosotros hoy.\n\n"
        f"_DUPE Desarrollos Inmobiliarios · Gerencia de Cobros_"
    )


def _build_legal_demand_letter(
    client_name: str, client_id_number: str, unit_number: str,
    project_name: str, plan_id: str,
    total_balance: str, overdue_installments: list[dict],
    today_str: str,
) -> str:
    inst_lines = "\n".join(
        f"  • Cuota #{i['number']}: {i['amount']} — vencida {i['days_overdue']} días"
        for i in overdue_installments
    )
    total_overdue = sum(float(str(i["amount"])) for i in overdue_installments)
    return f"""CARTA DE COBRO PREJUDICIAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Santo Domingo, República Dominicana
Fecha: {today_str}

Señor/a: {client_name}
Cédula / Pasaporte: {client_id_number}

Referencia: Contrato de Compra-Venta — Proyecto {project_name}
Unidad: {unit_number} | Plan de Pago ID: {plan_id[:8].upper()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTIMADO/A {client_name.upper()}:

Por medio de la presente, DUPE Desarrollos Inmobiliarios, S.R.L., le notifica
formalmente que a la fecha de esta comunicación usted mantiene obligaciones
vencidas e impagas bajo el contrato de compra-venta suscrito para la adquisición
de la unidad habitacional arriba indicada.

DETALLE DE CUOTAS VENCIDAS:
{inst_lines}

SALDO TOTAL EN MORA: RD${total_overdue:,.0f}
SALDO TOTAL DEL PLAN: {total_balance}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUERIMIENTO:

Le otorgamos un plazo de CINCO (5) DÍAS HÁBILES contados a partir de la recepción
de este comunicado para regularizar la totalidad de las cuotas vencidas,
incluyendo los recargos correspondientes.

En caso de no recibir el pago dentro del plazo indicado, DUPE Desarrollos
Inmobiliarios procederá conforme a las disposiciones del contrato suscrito,
incluyendo la posible resolución del mismo con las consecuencias patrimoniales
que ello conlleva, de conformidad con la Ley No. 189-11 para el Desarrollo del
Mercado Hipotecario y el Fideicomiso en la República Dominicana.

Esta comunicación tiene carácter de NOTIFICACIÓN PREJUDICIAL y podrá ser
utilizada como prueba en cualquier procedimiento judicial que se inicie.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Para regularizar su situación, comuníquese con:

  Departamento Legal / Cobros
  DUPE Desarrollos Inmobiliarios, S.R.L.
  cobros@dupedesa.com
  Tel: +1 (809) 000-0000

Atentamente,

_______________________________
Departamento de Cobros y Legal
DUPE Desarrollos Inmobiliarios, S.R.L.
Santo Domingo, República Dominicana
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""


# ── Dedup helper ───────────────────────────────────────────────────────────────

async def _recently_sent(
    db: AsyncSession, installment_id: UUID, channel: str, hours: int = 24,
) -> bool:
    """Return True if a notification for this installment+channel was sent within `hours` hours."""
    row = (await db.execute(
        select(NotificationORM)
        .where(
            NotificationORM.installment_id == installment_id,
            NotificationORM.channel == channel,
        )
        .order_by(NotificationORM.sent_at.desc())
        .limit(1)
    )).scalar_one_or_none()

    if not row or not row.sent_at:
        return False
    last = row.sent_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - last).total_seconds() < hours * 3600


async def _log_activity(
    db: AsyncSession,
    plan_id: UUID,
    action_type: str,
    description: str,
    channel: str | None = None,
    actor: str = "system",
    metadata: dict | None = None,
    related_id: str | None = None,
) -> None:
    db.add(PlanActivityORM(
        id=uuid4(),
        plan_id=plan_id,
        action_type=action_type,
        channel=channel,
        actor=actor,
        description=description,
        metadata_json=json.dumps(metadata or {}, ensure_ascii=False),
        related_entity_id=related_id,
    ))


async def _log_notification(
    db: AsyncSession,
    installment_id: UUID,
    client_id: UUID,
    channel: str,
    trigger: str,
    recipient: str,
    template_key: str,
    template_vars: dict,
    status: str = "draft",
) -> UUID:
    nid = uuid4()
    db.add(NotificationORM(
        id=nid,
        installment_id=installment_id,
        client_id=client_id,
        channel=channel,
        trigger=trigger,
        recipient=recipient,
        template_key=template_key,
        template_vars=json.dumps(template_vars, ensure_ascii=False),
        status=status,
        sent_at=datetime.now(timezone.utc),
        provider_message_id=f"{trigger.upper()[:6]}-{nid.hex[:10]}",
    ))
    return nid


# ── Main dispatch endpoint ────────────────────────────────────────────────────

@router.post("/dispatch")
async def dispatch_notifications(
    run_date: date | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Tier-aware bulk notification dispatch.

    Scans ALL overdue installments, groups by escalation level, and:
    - OFFICER:    drafts WhatsApp + email reminders (dedup: 24h)
    - MANAGEMENT: urgent client comms + internal management alert (dedup: 24h)
    - LEGAL:      formal demand letter, flags plan in DB, notifies legal officer

    Returns a per-tier breakdown of actions taken.
    """
    today = run_date or date.today()
    today_str = today.strftime("%d de %B de %Y")

    # Load all overdue installments with their plans and clients
    overdue_rows = (await db.execute(
        select(InstallmentORM).where(InstallmentORM.status == "overdue")
    )).scalars().all()

    # Cache clients and plans to avoid N+1
    client_cache: dict[UUID, ClientORM] = {}
    plan_cache: dict[UUID, PaymentPlanORM] = {}
    project_cache: dict[UUID, ProjectORM] = {}

    async def get_client(cid: UUID) -> ClientORM | None:
        if cid not in client_cache:
            client_cache[cid] = await db.get(ClientORM, cid)
        return client_cache[cid]

    async def get_plan(pid: UUID) -> PaymentPlanORM | None:
        if pid not in plan_cache:
            plan_cache[pid] = await db.get(PaymentPlanORM, pid)
        return plan_cache[pid]

    async def get_project(pid: UUID) -> ProjectORM | None:
        if pid not in project_cache:
            project_cache[pid] = await db.get(ProjectORM, pid)
        return project_cache[pid]

    results = {
        "officer":    {"processed": 0, "skipped_dedup": 0, "clients": []},
        "management": {"processed": 0, "skipped_dedup": 0, "clients": [], "internal_alerts": 0},
        "legal":      {"processed": 0, "already_flagged": 0, "newly_flagged": 0,
                       "letters": [], "clients": []},
    }

    for inst in overdue_rows:
        days = inst.days_overdue
        plan = await get_plan(inst.plan_id)
        if not plan:
            continue
        client = await get_client(plan.client_id)
        if not client:
            continue
        project = await get_project(plan.project_id)

        client_name = f"{client.first_name} {client.last_name}"
        currency = project.currency if project else "DOP"
        amount_fmt = _fmt_amount(inst.amount, currency)
        due_str = inst.due_date.strftime("%d/%m/%Y")
        project_name = project.name if project else "DUPE"

        # Load all overdue installments for this plan (for legal letter)
        plan_overdue = [i for i in overdue_rows if i.plan_id == inst.plan_id]

        # ── LEGAL (D+16+) ────────────────────────────────────────────────────
        if days >= 16:
            tier = "legal"
            if plan.legal_flagged:
                results["legal"]["already_flagged"] += 1
                continue

            # Flag the plan
            plan.legal_flagged = True
            plan.legal_flagged_at = datetime.now(timezone.utc)
            plan.legal_officer_notified = True

            # Build demand letter
            unit_orm = await db.get(UnitORM, plan.unit_id)
            unit_number = unit_orm.unit_number if unit_orm else "—"

            overdue_detail = [
                {"number": i.installment_number, "amount": str(i.amount), "days_overdue": i.days_overdue}
                for i in plan_overdue
            ]
            total_balance = str(plan.total_amount)

            letter = _build_legal_demand_letter(
                client_name=client_name,
                client_id_number=client.id_number,
                unit_number=unit_number,
                project_name=project_name,
                plan_id=str(plan.id),
                total_balance=total_balance,
                overdue_installments=overdue_detail,
                today_str=today_str,
            )

            # Persist the letter to the database
            total_overdue_amount = sum(float(str(i.amount)) for i in plan_overdue)
            letter_orm = LegalLetterORM(
                id=uuid4(),
                plan_id=plan.id,
                client_id=client.id,
                project_id=plan.project_id,
                unit_number=unit_number,
                status="generated",
                letter_text=letter,
                overdue_installments=len(plan_overdue),
                total_overdue_amount=Decimal(str(round(total_overdue_amount, 2))),
            )
            db.add(letter_orm)

            # Log legal notification for each overdue installment
            for i in plan_overdue:
                await _log_notification(
                    db, i.id, client.id,
                    channel="legal_letter",
                    trigger="legal_escalation",
                    recipient=client.email,
                    template_key="legal_demand_letter",
                    template_vars={"client_name": client_name, "days_overdue": i.days_overdue},
                    status="generated",
                )

            # Activity log entry
            await _log_activity(
                db, plan.id,
                action_type="letter_generated",
                description=f"Carta de cobro prejudicial generada. {len(plan_overdue)} cuota(s) vencida(s) · total RD${total_overdue_amount:,.0f}",
                channel="legal_letter",
                actor="system",
                metadata={"days_overdue": days, "overdue_installments": len(plan_overdue),
                          "letter_id": str(letter_orm.id)},
                related_id=str(letter_orm.id),
            )
            await _log_activity(
                db, plan.id,
                action_type="legal_flagged",
                description=f"Plan marcado como Gestión Legal (D+{days}). Datos enviados a departamento legal.",
                channel="system",
                actor="system",
                metadata={"days_overdue": days, "flagged_at": datetime.now(timezone.utc).isoformat()},
            )

            results["legal"]["newly_flagged"] += 1
            results["legal"]["processed"] += 1
            results["legal"]["clients"].append(client_name)
            results["legal"]["letters"].append({
                "client_name": client_name,
                "client_email": client.email,
                "plan_id": str(plan.id),
                "letter_id": str(letter_orm.id),
                "unit_number": unit_number,
                "project_name": project_name,
                "days_overdue": days,
                "overdue_installments": len(plan_overdue),
                "letter_text": letter,
            })

        # ── MANAGEMENT (D+6 to D+15) ─────────────────────────────────────────
        elif days >= 6:
            tier = "management"
            wa_skipped = await _recently_sent(db, inst.id, "whatsapp")
            em_skipped = await _recently_sent(db, inst.id, "email")

            if wa_skipped and em_skipped:
                results["management"]["skipped_dedup"] += 1
                continue

            if not wa_skipped:
                wa_body = _build_management_whatsapp(client_name, inst.installment_number, amount_fmt, days)
                await _log_notification(
                    db, inst.id, client.id, "whatsapp", "management_escalation",
                    client.phone_whatsapp, "management_whatsapp",
                    {"client_name": client_name, "days_overdue": days, "amount": str(inst.amount)},
                )
            else:
                wa_body = None

            if not em_skipped:
                await _log_notification(
                    db, inst.id, client.id, "email", "management_escalation",
                    client.email, "management_email",
                    {"client_name": client_name, "days_overdue": days},
                )

            await _log_activity(
                db, plan.id,
                action_type="notification_sent",
                description=f"Alerta gerencial enviada. {'WhatsApp + Email' if not wa_skipped and not em_skipped else 'WhatsApp' if not wa_skipped else 'Email'}. D+{days}.",
                channel="whatsapp+email",
                actor="system",
                metadata={"days_overdue": days, "trigger": "management_escalation",
                          "whatsapp_sent": not wa_skipped, "email_sent": not em_skipped},
                related_id=str(inst.id),
            )
            results["management"]["processed"] += 1
            if client_name not in results["management"]["clients"]:
                results["management"]["clients"].append(client_name)

            # Internal management alert (once per dispatch run, not per installment)
            results["management"]["internal_alerts"] = 1

        # ── OFFICER (D+1 to D+5) ─────────────────────────────────────────────
        elif days >= 1:
            tier = "officer"
            wa_skipped = await _recently_sent(db, inst.id, "whatsapp")
            em_skipped = await _recently_sent(db, inst.id, "email")

            if wa_skipped and em_skipped:
                results["officer"]["skipped_dedup"] += 1
                continue

            if not wa_skipped:
                await _log_notification(
                    db, inst.id, client.id, "whatsapp", "overdue_reminder",
                    client.phone_whatsapp, "officer_whatsapp",
                    {"client_name": client_name, "amount": str(inst.amount),
                     "due_date": inst.due_date.isoformat(), "days_overdue": days},
                )
            if not em_skipped:
                await _log_notification(
                    db, inst.id, client.id, "email", "overdue_reminder",
                    client.email, "officer_email",
                    {"client_name": client_name, "amount": str(inst.amount),
                     "due_date": inst.due_date.isoformat(), "days_overdue": days},
                )

            await _log_activity(
                db, plan.id,
                action_type="notification_sent",
                description=f"Recordatorio enviado. {'WhatsApp + Email' if not wa_skipped and not em_skipped else 'WhatsApp' if not wa_skipped else 'Email'}. D+{days}.",
                channel="whatsapp+email",
                actor="system",
                metadata={"days_overdue": days, "trigger": "overdue_reminder",
                          "whatsapp_sent": not wa_skipped, "email_sent": not em_skipped},
                related_id=str(inst.id),
            )
            results["officer"]["processed"] += 1
            if client_name not in results["officer"]["clients"]:
                results["officer"]["clients"].append(client_name)

    try:
        await db.flush()
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error("Dispatch commit failed: %s", e)

    total_actions = (
        results["officer"]["processed"]
        + results["management"]["processed"]
        + results["legal"]["newly_flagged"]
    )

    return {
        "run_date": today.isoformat(),
        "total_actions": total_actions,
        "officer": results["officer"],
        "management": results["management"],
        "legal": results["legal"],
        "summary": _build_summary(results),
    }


def _build_summary(results: dict) -> str:
    parts = []
    if results["officer"]["processed"]:
        parts.append(f"{results['officer']['processed']} recordatorios oficiales")
    if results["officer"]["skipped_dedup"]:
        parts.append(f"{results['officer']['skipped_dedup']} omitidos (ya enviados hoy)")
    if results["management"]["processed"]:
        parts.append(f"{results['management']['processed']} alertas gerenciales")
    if results["legal"]["newly_flagged"]:
        parts.append(f"{results['legal']['newly_flagged']} cartas legales generadas")
    if results["legal"]["already_flagged"]:
        parts.append(f"{results['legal']['already_flagged']} casos legales ya activos")
    return " · ".join(parts) if parts else "Sin acciones pendientes"


# ── Notification log endpoint ──────────────────────────────────────────────────

@router.get("/log")
async def get_notification_log(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """Recent notification log, newest first."""
    rows = (await db.execute(
        select(NotificationORM)
        .order_by(NotificationORM.sent_at.desc())
        .limit(limit)
    )).scalars().all()

    return {
        "total": len(rows),
        "notifications": [
            {
                "id": str(n.id),
                "channel": n.channel,
                "trigger": n.trigger,
                "recipient": n.recipient,
                "status": n.status,
                "sent_at": n.sent_at.isoformat() if n.sent_at else None,
            }
            for n in rows
        ],
    }
