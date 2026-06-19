"""
Admin data explorer router.
Returns table metadata, row counts, and paginated rows for every table.
DEMO / development use — not exposed in production.
"""
from __future__ import annotations
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.outbound.persistence.database import get_db
from dupe_platform.adapters.outbound.persistence.models import (
    ProjectORM, UnitORM, ClientORM, PaymentPlanORM, InstallmentORM,
    BudgetORM, PartidaORM, PartidaExecutionORM, BankTransactionORM,
    CashFlowMonthlyORM, InvoiceORM, LeadORM, ProspectORM,
    AgentAuditLogORM, GestionCaseORM, PostventaCaseORM, OfficerGoalORM,
    NotificationORM, LegalLetterORM, PlanActivityORM, CalendarEventORM,
)

router = APIRouter()

# ── Table registry — metadata for every ORM table ────────────────────────────

TABLE_REGISTRY = [
    # ── Financial / Project ───────────────────────────────────────────────────
    # ── All data lives in PostgreSQL. "origin" = how rows were first inserted. ──
    {
        "name": "projects",
        "label": "Proyectos",
        "module": "Financiero",
        "orm": ProjectORM,
        "origin": "Seed — Excel",
        "origin_detail": "Filas insertadas en el arranque desde el modelo financiero DUPE (seed.py). Valores — nombres, presupuestos, fechas, progreso físico — copiados directamente del Excel. Ahora viven en PostgreSQL y se actualizan vía API.",
        "feature": "Dashboard · Flujo de Caja · Presupuesto · Todos los módulos",
        "columns": ["id", "name", "project_type", "status", "total_units", "currency", "total_budget", "physical_progress_pct", "start_date", "expected_delivery_date"],
    },
    {
        "name": "units",
        "label": "Unidades",
        "module": "Financiero",
        "orm": UnitORM,
        "origin": "Seed — Excel+",
        "origin_detail": "Filas generadas en el seed con conteos del Excel (100 + 140 + 45 unidades) y precios por unidad del modelo. Los registros individuales son sintéticos; las cantidades y precios son del Excel.",
        "feature": "Portal de Cobranza · Comercial · Gestión · Postventa",
        "columns": ["id", "project_id", "unit_number", "floor", "area_sqm", "list_price", "is_sold", "client_id"],
    },
    {
        "name": "clients",
        "label": "Clientes",
        "module": "Cobranza",
        "orm": ClientORM,
        "origin": "Seed — Demo",
        "origin_detail": "15 clientes seeded para demo: nombres dominicanos reales, cédulas formato DR (001-XXXXXXX-X), teléfonos +1809, 3 internacionales para el proyecto turístico. En producción estos registros entran vía formulario de ventas.",
        "feature": "Portal de Cobranza · Gestión · Comercial",
        "columns": ["id", "first_name", "last_name", "id_number", "phone_whatsapp", "email", "nationality", "created_at"],
    },
    {
        "name": "payment_plans",
        "label": "Planes de Pago",
        "module": "Cobranza",
        "orm": PaymentPlanORM,
        "origin": "Seed — Excel+",
        "origin_detail": "Un plan por cada unidad vendida (65% del inventario). Montos del Excel. Creados en el seed — en producción entran cuando un vendedor registra una venta y el gestor aprueba el plan.",
        "feature": "Portal de Cobranza · Cola de Vencidos · Gestión Legal",
        "columns": ["id", "client_id", "unit_id", "project_id", "sale_date", "total_amount", "is_active", "approved_by", "legal_flagged", "created_at"],
    },
    {
        "name": "installments",
        "label": "Cuotas",
        "module": "Cobranza",
        "orm": InstallmentORM,
        "origin": "Seed — Excel+",
        "origin_detail": "8–16 cuotas por plan generadas en el seed. Fechas calculadas desde la fecha de venta. Algunas vencidas (days_overdue > 0) para demostrar alertas. En producción el sistema las genera al aprobar un plan.",
        "feature": "Portal de Cobranza · Cola de Vencidos",
        "columns": ["id", "plan_id", "installment_number", "due_date", "amount", "status", "paid_date", "paid_amount", "escalation_level", "days_overdue"],
    },
    {
        "name": "budgets",
        "label": "Presupuestos",
        "module": "Financiero",
        "orm": BudgetORM,
        "origin": "Seed — Excel",
        "origin_detail": "1 presupuesto por proyecto, seeded como contenedor de las partidas. Versión 1. En producción el gerente puede crear versiones revisadas del presupuesto.",
        "feature": "Dashboard · Flujo de Caja",
        "columns": ["id", "project_id", "version", "approved_date", "created_at"],
    },
    {
        "name": "partidas",
        "label": "Partidas Presupuestarias",
        "module": "Financiero",
        "orm": PartidaORM,
        "origin": "Seed — Excel",
        "origin_detail": "Partidas seeded desde las hojas EV del Excel: SUELO, CONSTRUCCIÓN, TÉCNICOS, JURÍDICO, COSTES FINANCIEROS, GESTIÓN, COMERCIALIZACIÓN, más ingresos (separaciones, cuotas, entrega, FONVIVIENDA). Los nombres y montos son del modelo financiero real.",
        "feature": "Dashboard (semáforos) · Flujo de Caja · Contabilidad",
        "columns": ["id", "budget_id", "code", "name", "partida_type", "budgeted_amount"],
    },
    {
        "name": "partida_executions",
        "label": "Ejecuciones de Partida",
        "module": "Financiero",
        "orm": PartidaExecutionORM,
        "origin": "Seed — Excel",
        "origin_detail": "Montos ejecutados seeded del Excel. GAS-004 al 112% para demostrar alerta roja. GAS-002 al 38.5% refleja avance físico. En producción entran vía Entrada de Datos o importación de facturas.",
        "feature": "Dashboard (semáforos) · Flujo de Caja",
        "columns": ["id", "budget_id", "partida_id", "project_id", "amount", "execution_date", "description", "entered_by"],
    },
    {
        "name": "bank_transactions",
        "label": "Transacciones Bancarias",
        "module": "Financiero",
        "orm": BankTransactionORM,
        "origin": "Vía UI / API",
        "origin_detail": "Vacía hasta que el usuario suba un CSV/TXT del netbanking. El parser de Conciliación crea estas filas. El Excel no tenía extractos bancarios — este módulo es net-new.",
        "feature": "Conciliación Bancaria",
        "columns": ["id", "transaction_date", "description", "reference", "amount", "balance_after", "status", "uploaded_at"],
    },
    {
        "name": "cash_flow_monthly",
        "label": "Flujo de Caja Mensual",
        "module": "Financiero",
        "orm": CashFlowMonthlyORM,
        "origin": "Seed — Excel",
        "origin_detail": "36 meses seeded desde el modelo de flujo de caja del Excel. Meses pasados marcados is_actual=true; futuros son proyección. En producción se actualizan al registrar transacciones reales.",
        "feature": "Flujo de Caja (gráficos) · Predicciones IA",
        "columns": ["id", "project_id", "month", "month_number", "is_actual", "income", "expenses", "net_cash_flow", "cumulative_balance"],
    },
    {
        "name": "invoices",
        "label": "Facturas / Comprobantes",
        "module": "Contabilidad",
        "orm": InvoiceORM,
        "origin": "Seed — Demo",
        "origin_detail": "Facturas demo seeded con NCF dominicanos, distintos tipos y estados. En producción el contador las ingresa vía formulario. El Excel no tenía registros de facturas — sólo totales por partida.",
        "feature": "Contabilidad · Estados Financieros",
        "columns": ["id", "project_id", "invoice_date", "proveedor", "ncf", "tipo", "partida_code", "amount", "status", "entered_by"],
    },
    {
        "name": "leads",
        "label": "Leads / Prospectos Comercial",
        "module": "Comercial",
        "orm": LeadORM,
        "origin": "Seed — Demo",
        "origin_detail": "Leads demo seeded para el pipeline de ventas. En producción entran desde formularios web, integración de Facebook Ads, o captación manual. ai_score se llena cuando el LeadScoringAgent los analiza.",
        "feature": "Módulo Comercial · IA Agéntica (Lead Scoring)",
        "columns": ["id", "project_id", "first_name", "last_name", "source", "status", "qualification_score", "ai_score", "assigned_seller", "created_at"],
    },
    {
        "name": "prospects",
        "label": "Prospectos IA",
        "module": "IA Agéntica",
        "orm": ProspectORM,
        "origin": "Agente IA",
        "origin_detail": "Vacía al inicio. El ProspectFinderAgent escribe aquí cuando se ejecuta desde IA Agéntica → Prospección. Filas creadas 100% por el agente, no por seed ni por el usuario directamente.",
        "feature": "IA Agéntica → Prospección",
        "columns": ["id", "project_id", "full_name", "source_platform", "municipality", "estimated_income_bracket", "affinity_score", "status", "discovered_at"],
    },
    {
        "name": "agent_audit_log",
        "label": "Log de Agentes IA",
        "module": "IA Agéntica",
        "orm": AgentAuditLogORM,
        "origin": "Sistema",
        "origin_detail": "Registro inmutable generado automáticamente por cada agente: LeadScoringAgent, ProspectFinderAgent. Incluye confidence_score, si usó LLM real, y duración. Nunca se edita ni borra.",
        "feature": "IA Agéntica → Actividad Agente",
        "columns": ["id", "agent_name", "action", "entity_type", "entity_id", "confidence_score", "llm_used", "duration_ms", "status", "created_at"],
    },
    {
        "name": "gestion_cases",
        "label": "Casos de Gestión",
        "module": "Gestión",
        "orm": GestionCaseORM,
        "origin": "Seed — Demo",
        "origin_detail": "Casos de gestión seeded para los clientes con planes activos. En producción se crean automáticamente al aprobar un plan. El Excel no tenía este flujo — es funcionalidad nueva.",
        "feature": "Módulo de Gestión",
        "columns": ["id", "client_id", "unit_id", "project_id", "assigned_officer", "doc_cedula", "doc_carta_trabajo", "fiduciaria_status", "contract_generated_at", "created_at"],
    },
    {
        "name": "postventa_cases",
        "label": "Casos de Postventa",
        "module": "Postventa",
        "orm": PostventaCaseORM,
        "origin": "Seed — Demo",
        "origin_detail": "Casos de entrega seeded para demo. En producción se crean cuando una unidad avanza a fase de entrega. El Excel no tenía este flujo — funcionalidad nueva.",
        "feature": "Módulo de Postventa",
        "columns": ["id", "client_id", "project_id", "assigned_officer", "status", "appointment_date", "delivery_date", "warranty_expiry_date", "created_at"],
    },
    {
        "name": "officer_goals",
        "label": "Metas por Oficial",
        "module": "Todos",
        "orm": OfficerGoalORM,
        "origin": "Seed — Demo",
        "origin_detail": "Metas demo seeded por departamento y período. En producción las asigna gerencia desde el módulo de Metas. El Excel no tenía tracking de metas por oficial.",
        "feature": "Metas · Dashboard por departamento",
        "columns": ["id", "department", "officer_name", "metric_name", "metric_unit", "target_value", "period", "created_at"],
    },
    {
        "name": "notifications",
        "label": "Notificaciones Enviadas",
        "module": "Cobranza",
        "orm": NotificationORM,
        "origin": "Vía UI / API",
        "origin_detail": "Vacía al inicio. Cada clic en WA o Email del Portal de Cobranza, o ejecución de Despachar Notificaciones, inserta una fila. Permite deduplicación (no enviar dos veces en 24h). Net-new — el Excel no tenía esto.",
        "feature": "Portal de Cobranza → deduplicación · Cola de Vencidos",
        "columns": ["id", "installment_id", "client_id", "channel", "trigger", "recipient", "status", "sent_at", "provider_message_id"],
    },
    {
        "name": "legal_letters",
        "label": "Cartas Legales",
        "module": "Cobranza",
        "orm": LegalLetterORM,
        "origin": "Sistema",
        "origin_detail": "Vacía al inicio. El sistema inserta una fila cuando Despachar Notificaciones detecta D+16 de mora y genera la carta prejudicial (Ley 189-11). La carta completa vive aquí en Postgres.",
        "feature": "Gestión Legal → Cartas Prejudiciales",
        "columns": ["id", "plan_id", "client_id", "unit_number", "status", "overdue_installments", "total_overdue_amount", "generated_at", "sent_at", "signed_by"],
    },
    {
        "name": "plan_activity",
        "label": "Historial de Plan (Provenance)",
        "module": "Cobranza",
        "orm": PlanActivityORM,
        "origin": "Sistema",
        "origin_detail": "Log append-only: cada acción sobre un plan (pago, notificación, aprobación, carta, escalación legal) genera una fila. Nunca se edita. Es el audit trail completo del ciclo de vida de cada plan.",
        "feature": "Historial de Plan · Auditoría",
        "columns": ["id", "plan_id", "action_type", "channel", "actor", "description", "related_entity_id", "created_at"],
    },
    {
        "name": "calendar_events",
        "label": "Eventos de Calendario",
        "module": "Todos",
        "orm": CalendarEventORM,
        "origin": "Seed — Demo",
        "origin_detail": "Eventos seeded para todos los departamentos. En producción los crean los oficiales al agendar citas, inspecciones, visitas. El Excel no tenía calendario — funcionalidad nueva.",
        "feature": "Calendario",
        "columns": ["id", "title", "event_type", "project_id", "responsible_officer", "event_date", "start_time", "status"],
    },
]

TABLE_MAP = {t["name"]: t for t in TABLE_REGISTRY}


def _serialize(val: Any) -> Any:
    """Convert non-JSON-serializable types."""
    if isinstance(val, UUID):
        return str(val)
    if hasattr(val, 'isoformat'):
        return val.isoformat()
    if hasattr(val, '__float__'):
        return float(val)
    return val


def _row_to_dict(row: Any, columns: list[str]) -> dict:
    result = {}
    for col in columns:
        val = getattr(row, col, None)
        result[col] = _serialize(val)
    return result


# ── GET /admin/tables — all tables with counts ────────────────────────────────

@router.get("/tables")
async def list_tables(db: AsyncSession = Depends(get_db)):
    """
    Returns metadata + row count for every table in the platform.
    Grouped by module.
    """
    results = []
    for meta in TABLE_REGISTRY:
        count_result = await db.execute(
            select(func.count()).select_from(meta["orm"])
        )
        count = count_result.scalar() or 0
        results.append({
            "name": meta["name"],
            "label": meta["label"],
            "module": meta["module"],
            "origin": meta["origin"],
            "origin_detail": meta["origin_detail"],
            "feature": meta["feature"],
            "row_count": count,
            "columns": meta["columns"],
        })
    return results


# ── GET /admin/tables/{table_name} — paginated rows ───────────────────────────

@router.get("/tables/{table_name}")
async def get_table_rows(
    table_name: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns paginated rows for the given table with total count.
    """
    meta = TABLE_MAP.get(table_name)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Unknown table: {table_name}")

    orm = meta["orm"]
    cols = meta["columns"]

    # Total count
    count_result = await db.execute(select(func.count()).select_from(orm))
    total = count_result.scalar() or 0

    # Rows — order by created_at desc if available, else by first PK column
    q = select(orm)
    if hasattr(orm, 'created_at'):
        q = q.order_by(orm.created_at.desc())
    elif hasattr(orm, 'generated_at'):
        q = q.order_by(orm.generated_at.desc())

    rows_result = await db.execute(q.offset(offset).limit(limit))
    rows = rows_result.scalars().all()

    return {
        "table": table_name,
        "label": meta["label"],
        "module": meta["module"],
        "origin": meta["origin"],
        "origin_detail": meta["origin_detail"],
        "feature": meta["feature"],
        "columns": cols,
        "total": total,
        "offset": offset,
        "limit": limit,
        "rows": [_row_to_dict(r, cols) for r in rows],
    }
