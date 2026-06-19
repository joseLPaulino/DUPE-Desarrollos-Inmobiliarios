"""
Financial analytics router — calculations that lived in the DUPE Excel model
and are now computed live from Postgres data.

Endpoints:
  GET /analytics/viabilidad/{project_id}   — TIR, VAN, BEP, payback, margin
  GET /analytics/sensibilidad/{project_id} — sensitivity matrix (price × cost)
  GET /analytics/mora/{plan_id}            — late payment penalty simulation
"""
from __future__ import annotations
from decimal import Decimal
from typing import Optional
from uuid import UUID

import numpy as np
import numpy_financial as npf
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.outbound.persistence.database import get_db
from dupe_platform.adapters.outbound.persistence.models import (
    CashFlowMonthlyORM, PartidaORM, PartidaExecutionORM,
    BudgetORM, ProjectORM, PaymentPlanORM, InstallmentORM,
)

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _irr_annual(monthly_cashflows: list[float]) -> float | None:
    """
    Compute IRR from a monthly cash flow series and annualise it.
    Returns None when the series has no sign change (IRR undefined).
    """
    arr = np.array(monthly_cashflows, dtype=float)
    # numpy-financial irr needs at least one sign change
    signs = np.sign(arr[arr != 0])
    if len(set(signs)) < 2:
        return None
    monthly = npf.irr(arr)
    if monthly is None or np.isnan(monthly):
        return None
    return float((1 + monthly) ** 12 - 1)


def _npv(annual_rate: float, monthly_cashflows: list[float]) -> float:
    """NPV at given annual discount rate from monthly cash flows."""
    monthly_rate = (1 + annual_rate) ** (1 / 12) - 1
    return float(npf.npv(monthly_rate, monthly_cashflows))


def _payback_month(cumulative: list[float]) -> int | None:
    """First month index where cumulative balance turns non-negative."""
    for i, v in enumerate(cumulative):
        if v >= 0:
            return i
    return None


def _build_cashflows(rows: list[CashFlowMonthlyORM]) -> tuple[list[float], list[float]]:
    """
    Returns (net_monthly, cumulative) from cash_flow_monthly rows,
    sorted by month_number.
    """
    sorted_rows = sorted(rows, key=lambda r: r.month_number)
    net = [float(r.net_cash_flow) for r in sorted_rows]
    cum = [float(r.cumulative_balance) for r in sorted_rows]
    return net, cum


async def _load_project(db: AsyncSession, project_id: UUID) -> ProjectORM:
    proj = await db.get(ProjectORM, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj


async def _load_cashflows(db: AsyncSession, project_id: UUID) -> list[CashFlowMonthlyORM]:
    result = await db.execute(
        select(CashFlowMonthlyORM)
        .where(CashFlowMonthlyORM.project_id == project_id)
        .order_by(CashFlowMonthlyORM.month_number)
    )
    return list(result.scalars().all())


async def _load_partidas(db: AsyncSession, project_id: UUID) -> tuple[list[PartidaORM], list[PartidaExecutionORM]]:
    """Load partidas + executions for the project's budget."""
    budget_result = await db.execute(
        select(BudgetORM).where(BudgetORM.project_id == project_id).limit(1)
    )
    budget = budget_result.scalar_one_or_none()
    if not budget:
        return [], []

    partidas_result = await db.execute(
        select(PartidaORM).where(PartidaORM.budget_id == budget.id)
    )
    partidas = list(partidas_result.scalars().all())

    execs_result = await db.execute(
        select(PartidaExecutionORM).where(PartidaExecutionORM.budget_id == budget.id)
    )
    execs = list(execs_result.scalars().all())
    return partidas, execs


def _partida_summary(partidas: list[PartidaORM], execs: list[PartidaExecutionORM]) -> dict:
    """
    Returns totals and per-partida breakdown.
    """
    income_partidas = [p for p in partidas if p.partida_type == "income"]
    expense_partidas = [p for p in partidas if p.partida_type == "expense"]

    total_income_budget = sum(float(p.budgeted_amount) for p in income_partidas)
    total_expense_budget = sum(float(p.budgeted_amount) for p in expense_partidas)

    exec_by_partida: dict[str, float] = {}
    for e in execs:
        exec_by_partida[str(e.partida_id)] = exec_by_partida.get(str(e.partida_id), 0) + float(e.amount)

    total_expense_executed = sum(exec_by_partida.values())

    # Fixed vs variable cost split:
    # Variable: construction (GAS-002) — scales with units built
    # Fixed: everything else (land, professionals, legal, finance, management, marketing)
    construction_partidas = [p for p in expense_partidas if "Construcción" in p.name or "construccion" in p.name.lower()]
    variable_cost_budget = sum(float(p.budgeted_amount) for p in construction_partidas)
    fixed_cost_budget = total_expense_budget - variable_cost_budget

    return {
        "total_income_budget": total_income_budget,
        "total_expense_budget": total_expense_budget,
        "total_expense_executed": total_expense_executed,
        "variable_cost_budget": variable_cost_budget,
        "fixed_cost_budget": fixed_cost_budget,
        "gross_margin_budget": total_income_budget - total_expense_budget,
        "margin_pct": (
            (total_income_budget - total_expense_budget) / total_income_budget * 100
            if total_income_budget > 0 else 0
        ),
    }


# ── GET /viabilidad/{project_id} ──────────────────────────────────────────────

@router.get("/viabilidad/{project_id}")
async def get_viabilidad(
    project_id: UUID,
    discount_rate: float = Query(0.15, ge=0.01, le=0.99, description="Annual discount rate for NPV (e.g. 0.15 = 15%)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Computes the financial viability metrics that used to live in the DUPE Excel:
    - TIR (IRR) — annualised from monthly cash flows
    - VAN (NPV) — at the given annual discount rate
    - Punto de Equilibrio — units needed to cover total costs
    - Período de Recuperación — month when cumulative balance turns positive
    - Margen Bruto — (ingresos - gastos) / ingresos
    - Rentabilidad sobre inversión (ROI)
    """
    proj = await _load_project(db, project_id)
    cf_rows = await _load_cashflows(db, project_id)
    partidas, execs = await _load_partidas(db, project_id)

    if not cf_rows:
        raise HTTPException(status_code=422, detail="No cash flow data for this project. Re-seed the database.")

    net_monthly, cum_monthly = _build_cashflows(cf_rows)

    # ── Core metrics ─────────────────────────────────────────────────────────
    irr = _irr_annual(net_monthly)
    van = _npv(discount_rate, net_monthly)
    payback_month_idx = _payback_month(cum_monthly)
    summary = _partida_summary(partidas, execs)

    total_units = proj.total_units
    total_income = summary["total_income_budget"]
    total_cost   = summary["total_expense_budget"]
    fixed_cost   = summary["fixed_cost_budget"]
    variable_cost_total = summary["variable_cost_budget"]
    variable_cost_per_unit = variable_cost_total / total_units if total_units > 0 else 0
    price_per_unit = total_income / total_units if total_units > 0 else 0

    # Break-even: units where revenue = total cost
    # Revenue per unit = price_per_unit
    # Cost per unit = variable_cost_per_unit
    # BEP = fixed_cost / (price_per_unit - variable_cost_per_unit)
    contribution_margin = price_per_unit - variable_cost_per_unit
    if contribution_margin > 0:
        bep_units = fixed_cost / contribution_margin
        bep_pct = bep_units / total_units * 100
    else:
        # Fallback: simpler BEP = total_cost / price_per_unit
        bep_units = total_cost / price_per_unit if price_per_unit > 0 else 0
        bep_pct = bep_units / total_units * 100 if total_units > 0 else 0

    gross_profit = total_income - total_cost
    margin_pct = (gross_profit / total_income * 100) if total_income > 0 else 0
    roi_pct = (gross_profit / total_cost * 100) if total_cost > 0 else 0

    # Actual execution metrics
    actual_income = sum(float(r.income) for r in cf_rows if r.is_actual)
    actual_expenses = sum(float(r.expenses) for r in cf_rows if r.is_actual)

    currency = proj.currency

    return {
        "project_id": str(project_id),
        "project_name": proj.name,
        "currency": currency,
        "total_units": total_units,
        "discount_rate_used": discount_rate,

        # ── Excel formulas now live here ──────────────────────────────────────
        "tir": {
            "value": round(irr * 100, 2) if irr is not None else None,
            "unit": "%",
            "label": "TIR (Tasa Interna de Retorno)",
            "description": "Retorno anualizado del proyecto sobre el capital invertido, calculado desde el flujo de caja mensual.",
            "interpretation": (
                "Excelente — supera el costo de capital típico RD (15–20%)" if irr and irr > 0.20
                else "Aceptable — dentro del rango de mercado" if irr and irr > 0.12
                else "Bajo — revisar supuestos de ingresos o costos" if irr is not None
                else "No calculable — flujo de caja sin cambio de signo suficiente"
            ),
        },
        "van": {
            "value": round(van, 2),
            "unit": currency,
            "label": f"VAN (Valor Actual Neto) @ {int(discount_rate*100)}%",
            "description": f"Valor presente neto de todos los flujos descontados a la tasa anual de {int(discount_rate*100)}%.",
            "interpretation": (
                "Positivo — el proyecto crea valor por encima del costo de capital" if van > 0
                else "Negativo — el proyecto destruye valor a esta tasa de descuento"
            ),
        },
        "punto_equilibrio": {
            "units": round(bep_units, 1),
            "pct_of_total": round(bep_pct, 1),
            "label": "Punto de Equilibrio",
            "description": f"Unidades mínimas a vender para cubrir todos los costos. Precio/unidad: {currency} {price_per_unit:,.0f}. Costo variable/unidad: {currency} {variable_cost_per_unit:,.0f}.",
            "interpretation": (
                f"{round(bep_pct, 0):.0f}% del inventario — {'viable' if bep_pct < 70 else 'ajustado' if bep_pct < 90 else 'riesgoso'}"
            ),
        },
        "payback": {
            "months": payback_month_idx + 1 if payback_month_idx is not None else None,
            "label": "Período de Recuperación",
            "description": "Mes del proyecto en que el flujo de caja acumulado se vuelve positivo.",
            "interpretation": (
                f"Mes {payback_month_idx + 1} de {len(cf_rows)}" if payback_month_idx is not None
                else "No recuperado dentro del horizonte del proyecto"
            ),
        },
        "margen": {
            "gross_profit": round(gross_profit, 2),
            "margin_pct": round(margin_pct, 2),
            "roi_pct": round(roi_pct, 2),
            "label": "Margen y ROI",
            "description": "Utilidad bruta sobre ingresos totales presupuestados y retorno sobre inversión.",
        },
        "budget_summary": {
            "total_income": round(total_income, 2),
            "total_cost": round(total_cost, 2),
            "fixed_cost": round(fixed_cost, 2),
            "variable_cost": round(variable_cost_total, 2),
            "price_per_unit": round(price_per_unit, 2),
            "variable_cost_per_unit": round(variable_cost_per_unit, 2),
            "contribution_margin_per_unit": round(contribution_margin, 2),
        },
        "actuals": {
            "income_to_date": round(actual_income, 2),
            "expenses_to_date": round(actual_expenses, 2),
            "net_to_date": round(actual_income - actual_expenses, 2),
            "months_with_actuals": sum(1 for r in cf_rows if r.is_actual),
        },
        "cashflow_series": [
            {
                "month": r.month,
                "month_number": r.month_number,
                "is_actual": r.is_actual,
                "net": float(r.net_cash_flow),
                "cumulative": float(r.cumulative_balance),
                "income": float(r.income),
                "expenses": float(r.expenses),
            }
            for r in sorted(cf_rows, key=lambda x: x.month_number)
        ],
    }


# ── GET /sensibilidad/{project_id} ────────────────────────────────────────────

@router.get("/sensibilidad/{project_id}")
async def get_sensibilidad(
    project_id: UUID,
    discount_rate: float = Query(0.15, ge=0.01, le=0.99),
    max_delta: float = Query(0.15, ge=0.05, le=0.50, description="Max % variation on each axis (e.g. 0.15 = ±15%)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Sensitivity analysis: recomputes TIR and VAN for a matrix of
    price changes (columns) × cost changes (rows).

    This was the "Análisis de Sensibilidad" table in the Excel EV sheets.
    """
    proj = await _load_project(db, project_id)
    cf_rows = await _load_cashflows(db, project_id)
    partidas, execs = await _load_partidas(db, project_id)

    if not cf_rows:
        raise HTTPException(status_code=422, detail="No cash flow data for this project.")

    net_base, _ = _build_cashflows(cf_rows)
    summary = _partida_summary(partidas, execs)

    base_income = summary["total_income_budget"]
    base_cost   = summary["total_expense_budget"]

    # Deltas: 7 evenly-spaced steps from -max_delta to +max_delta
    step = max_delta / 3
    deltas = [round(-max_delta + i * step, 4) for i in range(7)]

    # For each combination, adjust monthly net_cash_flow proportionally
    # Income delta shifts income component; cost delta shifts expense component
    income_fraction = [float(r.income) / max(float(r.income) + abs(float(r.expenses)), 1) for r in sorted(cf_rows, key=lambda x: x.month_number)]
    expense_fraction = [abs(float(r.expenses)) / max(float(r.income) + abs(float(r.expenses)), 1) for r in sorted(cf_rows, key=lambda x: x.month_number)]

    tir_matrix: list[list] = []
    van_matrix: list[list] = []

    for cost_delta in deltas:
        tir_row = []
        van_row = []
        for price_delta in deltas:
            # Adjust each month's net cash flow
            adjusted = []
            for i, net in enumerate(net_base):
                income_part = float(sorted(cf_rows, key=lambda x: x.month_number)[i].income)
                expense_part = abs(float(sorted(cf_rows, key=lambda x: x.month_number)[i].expenses))
                new_income  = income_part  * (1 + price_delta)
                new_expense = expense_part * (1 + cost_delta)
                adjusted.append(new_income - new_expense)
            irr = _irr_annual(adjusted)
            van = _npv(discount_rate, adjusted)
            tir_row.append(round(irr * 100, 1) if irr is not None else None)
            van_row.append(round(van / 1_000_000, 2))  # in millions for readability
        tir_matrix.append(tir_row)
        van_matrix.append(van_row)

    delta_labels = [f"{int(d*100):+d}%" for d in deltas]
    base_tir = _irr_annual(net_base)
    base_van = _npv(discount_rate, net_base)

    return {
        "project_id": str(project_id),
        "project_name": proj.name,
        "currency": proj.currency,
        "discount_rate_used": discount_rate,
        "base_tir": round(base_tir * 100, 2) if base_tir is not None else None,
        "base_van_millions": round(base_van / 1_000_000, 3),
        "price_deltas": delta_labels,   # columns
        "cost_deltas":  delta_labels,   # rows
        "tir_matrix": tir_matrix,       # [cost_row][price_col]
        "van_matrix": van_matrix,       # [cost_row][price_col], in millions
        "axis_labels": {
            "columns": "Variación de Precio de Venta",
            "rows":    "Variación de Costos de Construcción",
        },
    }


# ── GET /mora/{plan_id} ───────────────────────────────────────────────────────

@router.get("/mora/{plan_id}")
async def get_mora(
    plan_id: UUID,
    monthly_rate: float = Query(0.02, ge=0.001, le=0.10, description="Monthly late payment rate (e.g. 0.02 = 2%/month)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Late payment penalty (mora) calculation per overdue installment.
    DR real estate standard: 2–3% monthly on overdue balance.
    The Excel had no automatic mora calculation — this is new functionality.
    """
    plan = await db.get(PaymentPlanORM, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    result = await db.execute(
        select(InstallmentORM)
        .where(
            InstallmentORM.plan_id == plan_id,
            InstallmentORM.status == "overdue",
        )
        .order_by(InstallmentORM.installment_number)
    )
    overdue = list(result.scalars().all())

    items = []
    total_principal = Decimal("0")
    total_mora = Decimal("0")

    for inst in overdue:
        principal = inst.amount
        months_overdue = max(1, inst.days_overdue // 30)
        # Simple interest: principal × rate × months
        mora = principal * Decimal(str(monthly_rate)) * months_overdue
        items.append({
            "installment_number": inst.installment_number,
            "due_date": inst.due_date.isoformat(),
            "days_overdue": inst.days_overdue,
            "months_overdue": months_overdue,
            "principal": float(principal),
            "mora": round(float(mora), 2),
            "total_due": round(float(principal + mora), 2),
        })
        total_principal += principal
        total_mora += mora

    return {
        "plan_id": str(plan_id),
        "monthly_rate_used": monthly_rate,
        "rate_label": f"{monthly_rate * 100:.1f}% mensual",
        "overdue_installments": len(items),
        "total_principal": float(total_principal),
        "total_mora": round(float(total_mora), 2),
        "total_amount_due": round(float(total_principal + total_mora), 2),
        "items": items,
        "note": "Cálculo con interés simple. La tasa aplicable debe ser confirmada con el departamento legal según el contrato de compraventa.",
    }
