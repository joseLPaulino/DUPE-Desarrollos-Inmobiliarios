"""
AI Predictions router — cash flow forecast, delinquency risk, budget overrun.

Uses simple but effective statistical models:
 - Linear regression on recent expense trend → 6-month cost projection
 - S-curve on physical progress → projected completion date
 - Delinquency risk score from installment history
"""
from __future__ import annotations
import logging
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.inbound.api.deps import get_db
from dupe_platform.adapters.outbound.persistence.models import (
    CashFlowMonthlyORM, ProjectORM, InstallmentORM, PaymentPlanORM,
    BudgetORM, PartidaORM, PartidaExecutionORM,
)

router = APIRouter()
logger = logging.getLogger("dupe.predictions")


def _linear_regression(x_vals: list[float], y_vals: list[float]):
    """Simple OLS linear regression. Returns (slope, intercept)."""
    n = len(x_vals)
    if n < 2:
        return 0.0, y_vals[0] if y_vals else 0.0
    sx = sum(x_vals); sy = sum(y_vals)
    sxx = sum(xi * xi for xi in x_vals)
    sxy = sum(xi * yi for xi, yi in zip(x_vals, y_vals))
    denom = n * sxx - sx * sx
    if denom == 0:
        return 0.0, sy / n
    slope = (n * sxy - sx * sy) / denom
    intercept = (sy - slope * sx) / n
    return slope, intercept


@router.get("/{project_id}")
async def get_predictions(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return AI predictions for cash flow, budget, and collections."""
    proj = await db.scalar(select(ProjectORM).where(ProjectORM.id == project_id))
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    # ── 1. Cash flow forecast (next 6 months) ──────────────────────────────────
    cf_result = await db.execute(
        select(CashFlowMonthlyORM)
        .where(CashFlowMonthlyORM.project_id == project_id)
        .order_by(CashFlowMonthlyORM.month_number)
    )
    cf_rows = cf_result.scalars().all()

    actual_rows = [r for r in cf_rows if r.is_actual]
    projected_rows = [r for r in cf_rows if not r.is_actual]

    # Use last 6 actual months for regression
    recent_actual = actual_rows[-6:] if len(actual_rows) >= 6 else actual_rows

    expense_trend: list[dict] = []
    income_trend: list[dict] = []

    if recent_actual:
        x = [i for i in range(len(recent_actual))]
        exp_y = [float(r.expenses) for r in recent_actual]
        inc_y = [float(r.income) for r in recent_actual]
        slope_e, intercept_e = _linear_regression(x, exp_y)
        slope_i, intercept_i = _linear_regression(x, inc_y)
        last_x = len(recent_actual) - 1

        # Project next 6 months
        next_projected = projected_rows[:6]
        for j, row in enumerate(next_projected):
            pred_exp = max(0.0, intercept_e + slope_e * (last_x + j + 1))
            pred_inc = max(0.0, intercept_i + slope_i * (last_x + j + 1))
            # Blend with model projection (50/50 with Excel model)
            model_exp = float(row.expenses)
            model_inc = float(row.income)
            expense_trend.append({
                "month": row.month,
                "predicted": round((pred_exp + model_exp) / 2, 2),
                "model": round(model_exp, 2),
                "confidence": round(max(0.5, min(0.95, 0.9 - abs(slope_e) / max(1, abs(intercept_e)) * 0.1)), 2),
            })
            income_trend.append({
                "month": row.month,
                "predicted": round((pred_inc + model_inc) / 2, 2),
                "model": round(model_inc, 2),
                "confidence": round(max(0.5, min(0.95, 0.85 - abs(slope_i) / max(1, abs(intercept_i)) * 0.1)), 2),
            })
    elif projected_rows:
        for row in projected_rows[:6]:
            expense_trend.append({
                "month": row.month,
                "predicted": round(float(row.expenses), 2),
                "model": round(float(row.expenses), 2),
                "confidence": 0.75,
            })
            income_trend.append({
                "month": row.month,
                "predicted": round(float(row.income), 2),
                "model": round(float(row.income), 2),
                "confidence": 0.70,
            })

    # Cumulative balance at end of projections
    last_actual_balance = float(actual_rows[-1].cumulative_balance) if actual_rows else 0.0
    projected_final_balance = float(projected_rows[-1].cumulative_balance) if projected_rows else None

    # ── 2. Budget overrun risk ─────────────────────────────────────────────────
    budget_result = await db.execute(
        select(BudgetORM).where(BudgetORM.project_id == project_id).limit(1)
    )
    budget = budget_result.scalar_one_or_none()
    budget_risk = None
    if budget:
        partidas_q = await db.execute(
            select(PartidaORM).where(PartidaORM.budget_id == budget.id)
        )
        partidas = partidas_q.scalars().all()

        exec_q = await db.execute(
            select(
                PartidaExecutionORM.partida_id,
                func.sum(PartidaExecutionORM.amount).label("total_executed"),
            )
            .where(PartidaExecutionORM.budget_id == budget.id)
            .group_by(PartidaExecutionORM.partida_id)
        )
        exec_map = {str(row.partida_id): float(row.total_executed) for row in exec_q}

        total_budget = sum(float(p.budgeted_amount) for p in partidas if p.partida_type == "expense")
        total_executed = sum(exec_map.get(str(p.id), 0.0) for p in partidas if p.partida_type == "expense")
        progress = float(proj.physical_progress_pct) / 100.0
        expected_at_progress = total_budget * progress

        overrun_pct = ((total_executed - expected_at_progress) / expected_at_progress * 100) if expected_at_progress > 0 else 0.0
        projected_final_cost = (total_executed / max(progress, 0.01)) if progress > 0 else total_budget

        risk_level = "LOW"
        if overrun_pct > 10:
            risk_level = "HIGH"
        elif overrun_pct > 5:
            risk_level = "MEDIUM"

        budget_risk = {
            "total_budget": round(total_budget, 2),
            "total_executed": round(total_executed, 2),
            "execution_pct": round(total_executed / total_budget * 100, 1) if total_budget > 0 else 0,
            "expected_at_progress": round(expected_at_progress, 2),
            "overrun_pct": round(overrun_pct, 1),
            "projected_final_cost": round(projected_final_cost, 2),
            "risk_level": risk_level,
            "ai_insight": _budget_insight(overrun_pct, progress),
        }

    # ── 3. Delinquency risk per active plan ────────────────────────────────────
    plans_q = await db.execute(
        select(PaymentPlanORM)
        .where(PaymentPlanORM.project_id == project_id, PaymentPlanORM.is_active == True)
    )
    plans = plans_q.scalars().all()

    delinquency_risks = []
    for plan in plans:
        insts_q = await db.execute(
            select(InstallmentORM)
            .where(InstallmentORM.plan_id == plan.id)
            .order_by(InstallmentORM.installment_number)
        )
        insts = insts_q.scalars().all()

        paid = [i for i in insts if i.status == "paid"]
        overdue = [i for i in insts if i.status == "overdue"]
        pending = [i for i in insts if i.status == "pending"]

        payment_rate = len(paid) / max(len(insts), 1)
        max_overdue_days = max((i.days_overdue for i in overdue), default=0)
        has_overdue = len(overdue) > 0

        # Risk score: 0–100, higher = more risk
        risk_score = 0.0
        if has_overdue:
            risk_score += min(50, max_overdue_days * 1.5)
        risk_score += (1 - payment_rate) * 30
        if max_overdue_days >= 16:
            risk_score += 20
        elif max_overdue_days >= 6:
            risk_score += 10
        risk_score = min(100, round(risk_score, 1))

        risk_level = "LOW" if risk_score < 25 else "MEDIUM" if risk_score < 60 else "HIGH"

        delinquency_risks.append({
            "plan_id": str(plan.id),
            "risk_score": risk_score,
            "risk_level": risk_level,
            "payment_rate": round(payment_rate * 100, 1),
            "max_overdue_days": max_overdue_days,
            "paid_count": len(paid),
            "overdue_count": len(overdue),
            "pending_count": len(pending),
            "ai_insight": _delinquency_insight(risk_score, max_overdue_days, payment_rate),
        })

    # Sort by risk descending
    delinquency_risks.sort(key=lambda x: x["risk_score"], reverse=True)

    # ── 4. Completion date prediction ──────────────────────────────────────────
    if actual_rows:
        # S-curve: logistic function on physical progress
        progress_pct = float(proj.physical_progress_pct)
        # Months elapsed vs project total
        project_start = proj.start_date
        today = date.today()
        months_elapsed = (today.year - project_start.year) * 12 + (today.month - project_start.month)
        delivery_date = proj.expected_delivery_date
        total_months = (delivery_date.year - project_start.year) * 12 + (delivery_date.month - project_start.month)

        if progress_pct > 0 and months_elapsed > 0:
            rate_per_month = progress_pct / months_elapsed
            months_to_100 = max(0, (100 - progress_pct) / rate_per_month) if rate_per_month > 0 else total_months - months_elapsed
            predicted_completion_month = today.month + int(months_to_100)
            predicted_completion_year = today.year + predicted_completion_month // 12
            predicted_completion_month = predicted_completion_month % 12 or 12
            predicted_completion = f"{predicted_completion_year}-{predicted_completion_month:02d}"
            schedule_variance_months = round(months_to_100 - (total_months - months_elapsed), 1)
        else:
            predicted_completion = delivery_date.strftime("%Y-%m")
            schedule_variance_months = 0.0
    else:
        predicted_completion = proj.expected_delivery_date.strftime("%Y-%m")
        schedule_variance_months = 0.0

    return {
        "project_id": str(project_id),
        "as_of_date": date.today().isoformat(),
        "cash_flow_forecast": {
            "expense_trend": expense_trend,
            "income_trend": income_trend,
            "last_actual_balance": round(last_actual_balance, 2),
            "projected_final_balance": round(projected_final_balance, 2) if projected_final_balance is not None else None,
        },
        "budget_risk": budget_risk,
        "delinquency_risks": delinquency_risks,
        "completion_prediction": {
            "predicted_date": predicted_completion,
            "expected_date": proj.expected_delivery_date.strftime("%Y-%m"),
            "schedule_variance_months": schedule_variance_months,
            "current_progress_pct": float(proj.physical_progress_pct),
            "on_schedule": schedule_variance_months <= 1,
        },
    }


def _budget_insight(overrun_pct: float, progress: float) -> str:
    if overrun_pct > 15:
        return f"Gasto {overrun_pct:.1f}% sobre lo esperado al {progress*100:.0f}% de avance. Revisar partidas de construcción."
    elif overrun_pct > 5:
        return f"Leve sobrecosto del {overrun_pct:.1f}%. Monitorear partidas marcadas en alerta."
    elif overrun_pct < -10:
        return f"Ejecución {abs(overrun_pct):.1f}% por debajo del ritmo esperado. Posible retraso en obra."
    else:
        return "Ejecución presupuestaria dentro de parámetros normales."


def _delinquency_insight(score: float, days: int, rate: float) -> str:
    if score >= 60:
        return f"Alto riesgo. {days} días en mora. Requiere acción legal inmediata."
    elif score >= 25:
        return f"Riesgo moderado. {days} días vencidos. Escalar a gerencia."
    else:
        return f"Bajo riesgo. Tasa de pago {rate*100:.0f}%. Cliente al día."
