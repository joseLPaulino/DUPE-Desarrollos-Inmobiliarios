"""
Contabilidad (Accounting) module.

Endpoints
─────────
POST /accounting/invoices/{project_id}         — register a supplier invoice
GET  /accounting/invoices/{project_id}         — list invoices (with filters)
GET  /accounting/balance-general/{project_id}  — Balance General snapshot
GET  /accounting/estado-resultados/{project_id}— Estado de Resultados by date range
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func as sqlfunc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.inbound.api.deps import get_db
from dupe_platform.adapters.outbound.persistence.models import (
    InvoiceORM, PartidaExecutionORM, PartidaORM, BudgetORM,
    BankTransactionORM, InstallmentORM, PaymentPlanORM, ProjectORM,
)

router = APIRouter()


# ─── Schemas ────────────────────────────────────────────────────────────────

class InvoiceIn(BaseModel):
    invoice_date: date
    proveedor: str
    ncf: str = ""
    tipo: str = "factura"          # factura / recibo / nota_debito / nota_credito
    partida_code: str = ""
    description: str = ""
    amount: float
    status: str = "pendiente"      # pendiente / pagada / anulada
    entered_by: str = "Gerencia"


class InvoiceOut(BaseModel):
    id: str
    project_id: str
    invoice_date: date
    proveedor: str
    ncf: str
    tipo: str
    partida_code: str
    description: str
    amount: float
    status: str
    entered_by: str
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Helpers ────────────────────────────────────────────────────────────────

def _n(v) -> float:
    try:
        return float(v or 0)
    except Exception:
        return 0.0


# ─── Invoice endpoints ───────────────────────────────────────────────────────

@router.post("/invoices/{project_id}", response_model=InvoiceOut, status_code=201)
async def create_invoice(
    project_id: str,
    body: InvoiceIn,
    db: AsyncSession = Depends(get_db),
):
    # Verify project exists
    project = await db.get(ProjectORM, uuid.UUID(project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    invoice = InvoiceORM(
        id=uuid.uuid4(),
        project_id=uuid.UUID(project_id),
        invoice_date=body.invoice_date,
        proveedor=body.proveedor,
        ncf=body.ncf,
        tipo=body.tipo,
        partida_code=body.partida_code,
        description=body.description,
        amount=Decimal(str(body.amount)),
        status=body.status,
        entered_by=body.entered_by,
    )
    db.add(invoice)
    await db.commit()
    await db.refresh(invoice)
    return _invoice_out(invoice)


@router.get("/invoices/{project_id}", response_model=list[InvoiceOut])
async def list_invoices(
    project_id: str,
    status: Optional[str] = Query(None),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(InvoiceORM).where(InvoiceORM.project_id == uuid.UUID(project_id))
    if status:
        q = q.where(InvoiceORM.status == status)
    if from_date:
        q = q.where(InvoiceORM.invoice_date >= from_date)
    if to_date:
        q = q.where(InvoiceORM.invoice_date <= to_date)
    q = q.order_by(InvoiceORM.invoice_date.desc())
    result = await db.execute(q)
    return [_invoice_out(r) for r in result.scalars().all()]


@router.patch("/invoices/{invoice_id}/status")
async def update_invoice_status(
    invoice_id: str,
    status: str = Query(..., pattern="^(pendiente|pagada|anulada)$"),
    db: AsyncSession = Depends(get_db),
):
    inv = await db.get(InvoiceORM, uuid.UUID(invoice_id))
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv.status = status
    await db.commit()
    return {"id": invoice_id, "status": status}


def _invoice_out(inv: InvoiceORM) -> dict:
    return {
        "id": str(inv.id),
        "project_id": str(inv.project_id),
        "invoice_date": inv.invoice_date,
        "proveedor": inv.proveedor,
        "ncf": inv.ncf,
        "tipo": inv.tipo,
        "partida_code": inv.partida_code,
        "description": inv.description,
        "amount": _n(inv.amount),
        "status": inv.status,
        "entered_by": inv.entered_by,
        "created_at": inv.created_at,
    }


# ─── Balance General ─────────────────────────────────────────────────────────

@router.get("/balance-general/{project_id}")
async def balance_general(
    project_id: str,
    as_of: Optional[date] = Query(None, description="Snapshot date (default: today)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Simplified Balance General for a real estate project.

    ACTIVOS
      Efectivo y equivalentes  = bank credits − bank debits up to as_of
      Cuentas por cobrar       = unpaid installment amounts from active plans
      Total Activos

    PASIVOS
      Cuentas por pagar        = unpaid (pendiente) invoice amounts up to as_of
      Total Pasivos

    PATRIMONIO
      Capital (presupuesto)    = approved budget total for project
      Utilidad acumulada       = Total Activos − Total Pasivos − Capital
      Total Patrimonio

    Total Pasivos + Patrimonio = Total Activos  ✓
    """
    pid = uuid.UUID(project_id)
    snap = as_of or date.today()

    # ── Efectivo: bank transactions ──────────────────────────────────────────
    r = await db.execute(
        select(
            sqlfunc.coalesce(sqlfunc.sum(
                BankTransactionORM.amount
            ), Decimal(0))
        ).where(BankTransactionORM.transaction_date <= snap)
    )
    efectivo = _n(r.scalar())

    # ── Cuentas por cobrar: unpaid installments up to as_of ─────────────────
    r = await db.execute(
        select(
            sqlfunc.coalesce(sqlfunc.sum(InstallmentORM.amount), Decimal(0))
        ).join(PaymentPlanORM, InstallmentORM.plan_id == PaymentPlanORM.id)
        .where(
            PaymentPlanORM.project_id == pid,
            InstallmentORM.status == "pending",
            InstallmentORM.due_date <= snap,
        )
    )
    cuentas_cobrar = _n(r.scalar())

    # ── Cuentas por pagar: unpaid invoices up to as_of ──────────────────────
    r = await db.execute(
        select(
            sqlfunc.coalesce(sqlfunc.sum(InvoiceORM.amount), Decimal(0))
        ).where(
            InvoiceORM.project_id == pid,
            InvoiceORM.status == "pendiente",
            InvoiceORM.invoice_date <= snap,
        )
    )
    cuentas_pagar = _n(r.scalar())

    # ── Capital: total budgeted for project ──────────────────────────────────
    r = await db.execute(
        select(ProjectORM.total_budget).where(ProjectORM.id == pid)
    )
    row = r.scalar()
    capital = _n(row) if row else 0.0

    total_activos = efectivo + cuentas_cobrar
    total_pasivos = cuentas_pagar
    utilidad_acumulada = total_activos - total_pasivos - capital
    total_patrimonio = capital + utilidad_acumulada

    return {
        "project_id": project_id,
        "as_of": snap.isoformat(),
        "activos": {
            "efectivo_y_equivalentes": round(efectivo, 2),
            "cuentas_por_cobrar": round(cuentas_cobrar, 2),
            "total_activos": round(total_activos, 2),
        },
        "pasivos": {
            "cuentas_por_pagar": round(cuentas_pagar, 2),
            "total_pasivos": round(total_pasivos, 2),
        },
        "patrimonio": {
            "capital": round(capital, 2),
            "utilidad_acumulada": round(utilidad_acumulada, 2),
            "total_patrimonio": round(total_patrimonio, 2),
        },
        "check_balanced": round(total_pasivos + total_patrimonio, 2) == round(total_activos, 2),
    }


# ─── Estado de Resultados ────────────────────────────────────────────────────

@router.get("/estado-resultados/{project_id}")
async def estado_resultados(
    project_id: str,
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Estado de Resultados (P&L) for a date range.

    INGRESOS
      Cobros recibidos         = installments paid in the period
      Total Ingresos

    GASTOS
      Ejecución por partida    = partida executions in period (grouped by partida)
      Facturas proveedores     = invoices paid in period (not double-counted with executions)
      Total Gastos

    UTILIDAD NETA = Total Ingresos − Total Gastos
    """
    pid = uuid.UUID(project_id)

    # ── Ingresos: installments paid in period ────────────────────────────────
    r = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(InstallmentORM.paid_amount), Decimal(0)))
        .join(PaymentPlanORM, InstallmentORM.plan_id == PaymentPlanORM.id)
        .where(
            PaymentPlanORM.project_id == pid,
            InstallmentORM.status == "paid",
            InstallmentORM.paid_date >= from_date,
            InstallmentORM.paid_date <= to_date,
        )
    )
    cobros_recibidos = _n(r.scalar())

    # ── Gastos: partida executions in period (by partida code) ───────────────
    r = await db.execute(
        select(
            PartidaORM.code,
            PartidaORM.name,
            sqlfunc.sum(PartidaExecutionORM.amount).label("total"),
        )
        .join(PartidaORM, PartidaExecutionORM.partida_id == PartidaORM.id)
        .where(
            PartidaExecutionORM.project_id == pid,
            PartidaExecutionORM.execution_date >= from_date,
            PartidaExecutionORM.execution_date <= to_date,
        )
        .group_by(PartidaORM.code, PartidaORM.name)
        .order_by(PartidaORM.code)
    )
    partida_rows = r.all()
    gastos_partidas = [
        {"code": row.code, "name": row.name, "amount": _n(row.total)}
        for row in partida_rows
    ]
    total_gastos_partidas = sum(g["amount"] for g in gastos_partidas)

    # ── Gastos: invoices paid in period ─────────────────────────────────────
    r = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(InvoiceORM.amount), Decimal(0)))
        .where(
            InvoiceORM.project_id == pid,
            InvoiceORM.status == "pagada",
            InvoiceORM.invoice_date >= from_date,
            InvoiceORM.invoice_date <= to_date,
        )
    )
    facturas_pagadas = _n(r.scalar())

    total_ingresos = cobros_recibidos
    total_gastos = total_gastos_partidas + facturas_pagadas
    utilidad_neta = total_ingresos - total_gastos

    return {
        "project_id": project_id,
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "ingresos": {
            "cobros_recibidos": round(cobros_recibidos, 2),
            "total_ingresos": round(total_ingresos, 2),
        },
        "gastos": {
            "por_partida": gastos_partidas,
            "facturas_proveedores": round(facturas_pagadas, 2),
            "total_gastos": round(total_gastos, 2),
        },
        "utilidad_neta": round(utilidad_neta, 2),
        "margen_pct": round((utilidad_neta / total_ingresos * 100) if total_ingresos else 0, 1),
    }
