"""SQLAlchemy ORM models (persistence layer — separate from domain models)."""
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Integer, Numeric,
    String, Text, func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class ProjectORM(Base):
    __tablename__ = "projects"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    project_type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50))
    start_date: Mapped[date] = mapped_column(Date)
    expected_delivery_date: Mapped[date] = mapped_column(Date)
    total_units: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="DOP")
    total_budget: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    physical_progress_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    units: Mapped[list[UnitORM]] = relationship("UnitORM", back_populates="project")
    budgets: Mapped[list[BudgetORM]] = relationship("BudgetORM", back_populates="project")
    payment_plans: Mapped[list[PaymentPlanORM]] = relationship("PaymentPlanORM", back_populates="project")


class UnitORM(Base):
    __tablename__ = "units"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"))
    unit_number: Mapped[str] = mapped_column(String(20))
    floor: Mapped[int] = mapped_column(Integer)
    area_sqm: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    list_price: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    is_sold: Mapped[bool] = mapped_column(Boolean, default=False)
    client_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)

    project: Mapped[ProjectORM] = relationship("ProjectORM", back_populates="units")


class ClientORM(Base):
    __tablename__ = "clients"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    id_number: Mapped[str] = mapped_column(String(50), unique=True)
    phone_whatsapp: Mapped[str] = mapped_column(String(20))
    email: Mapped[str] = mapped_column(String(200))
    nationality: Mapped[str] = mapped_column(String(100), default="Dominicana")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    payment_plans: Mapped[list[PaymentPlanORM]] = relationship("PaymentPlanORM", back_populates="client")


class PaymentPlanORM(Base):
    __tablename__ = "payment_plans"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    client_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("clients.id"))
    unit_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("units.id"))
    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"))
    sale_date: Mapped[date] = mapped_column(Date)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    # Legal escalation tracking
    legal_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    legal_flagged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    legal_officer_notified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    client: Mapped[ClientORM] = relationship("ClientORM", back_populates="payment_plans")
    project: Mapped[ProjectORM] = relationship("ProjectORM", back_populates="payment_plans")
    installments: Mapped[list[InstallmentORM]] = relationship("InstallmentORM", back_populates="plan", order_by="InstallmentORM.installment_number")


class InstallmentORM(Base):
    __tablename__ = "installments"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    plan_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("payment_plans.id"))
    installment_number: Mapped[int] = mapped_column(Integer)
    due_date: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    paid_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    escalation_level: Mapped[str] = mapped_column(String(20), default="none")
    days_overdue: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")

    plan: Mapped[PaymentPlanORM] = relationship("PaymentPlanORM", back_populates="installments")


class BudgetORM(Base):
    __tablename__ = "budgets"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    approved_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[ProjectORM] = relationship("ProjectORM", back_populates="budgets")
    partidas: Mapped[list[PartidaORM]] = relationship("PartidaORM", back_populates="budget")
    executions: Mapped[list[PartidaExecutionORM]] = relationship("PartidaExecutionORM", back_populates="budget")


class PartidaORM(Base):
    __tablename__ = "partidas"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    budget_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("budgets.id"))
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(200))
    partida_type: Mapped[str] = mapped_column(String(20))
    budgeted_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    parent_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("partidas.id"), nullable=True)

    budget: Mapped[BudgetORM] = relationship("BudgetORM", back_populates="partidas")


class PartidaExecutionORM(Base):
    __tablename__ = "partida_executions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    budget_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("budgets.id"))
    partida_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("partidas.id"))
    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    execution_date: Mapped[date] = mapped_column(Date)
    transaction_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    entered_by: Mapped[str] = mapped_column(String(100), default="system")

    budget: Mapped[BudgetORM] = relationship("BudgetORM", back_populates="executions")


class BankTransactionORM(Base):
    __tablename__ = "bank_transactions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    transaction_date: Mapped[date] = mapped_column(Date)
    value_date: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(Text)
    reference: Mapped[str] = mapped_column(String(100))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    balance_after: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    raw_line: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="unmatched")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CashFlowMonthlyORM(Base):
    """Monthly cash flow projection from Excel model (actual + projected)."""
    __tablename__ = "cash_flow_monthly"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"))
    month: Mapped[str] = mapped_column(String(7))          # "YYYY-MM"
    month_number: Mapped[int] = mapped_column(Integer)      # MES 1, MES 2, …
    is_actual: Mapped[bool] = mapped_column(Boolean, default=False)  # False = projected
    income: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    expenses: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    net_cash_flow: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    cumulative_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    # Income breakdown
    income_ventas: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    income_separaciones: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    income_entregas: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    income_financiamiento: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    # Expense breakdown
    exp_construccion: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    exp_suelo: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    exp_tecnicos: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    exp_juridico: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    exp_financiero: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    exp_gestion: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    exp_comercializacion: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)

    project: Mapped["ProjectORM"] = relationship("ProjectORM")


class InvoiceORM(Base):
    """Supplier invoice / expense voucher for Contabilidad module."""
    __tablename__ = "invoices"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"))
    invoice_date: Mapped[date] = mapped_column(Date)
    proveedor: Mapped[str] = mapped_column(String(200))          # supplier name
    ncf: Mapped[str] = mapped_column(String(30), default="")     # DR tax number
    tipo: Mapped[str] = mapped_column(String(30), default="factura")  # factura/recibo/nota_debito/nota_credito
    partida_code: Mapped[str] = mapped_column(String(30), default="")  # budget partida reference
    description: Mapped[str] = mapped_column(Text, default="")
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    status: Mapped[str] = mapped_column(String(20), default="pendiente")  # pendiente/pagada/anulada
    entered_by: Mapped[str] = mapped_column(String(100), default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["ProjectORM"] = relationship("ProjectORM")


class LeadORM(Base):
    """Sales prospect / lead — Departamento Comercial."""
    __tablename__ = "leads"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"))
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(30), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    source: Mapped[str] = mapped_column(String(50), default="otro")   # facebook/instagram/referido/portal/evento/otro
    status: Mapped[str] = mapped_column(String(30), default="nuevo")  # nuevo/contactado/calificado/reservado/descartado
    qualification_score: Mapped[int] = mapped_column(Integer, default=0)  # 0–5
    assigned_seller: Mapped[str] = mapped_column(String(100), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    # AI Intelligence fields (populated by LeadScoringAgent)
    ai_score: Mapped[int | None] = mapped_column(Integer, nullable=True)             # 0–100
    ai_brief: Mapped[str | None] = mapped_column(Text, nullable=True)                # seller briefing paragraph
    ai_signals: Mapped[str | None] = mapped_column(Text, nullable=True)              # JSON [{signal, positive}]
    ai_recommended_action: Mapped[str | None] = mapped_column(String(300), nullable=True)
    ai_analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["ProjectORM"] = relationship("ProjectORM")


class ProspectORM(Base):
    """AI-discovered prospect — output of ProspectFinderAgent before entering leads pipeline."""
    __tablename__ = "prospects"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"))
    full_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(30), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    source_platform: Mapped[str] = mapped_column(String(100), default="")  # e.g. "INVI Waitlist", "Facebook Group"
    source_context: Mapped[str] = mapped_column(Text, default="")          # why the agent found them
    municipality: Mapped[str] = mapped_column(String(100), default="")
    estimated_income_bracket: Mapped[str] = mapped_column(String(50), default="")  # bajo/medio/alto
    affinity_score: Mapped[int] = mapped_column(Integer, default=0)        # 0–100
    # converted | rejected | pending
    status: Mapped[str] = mapped_column(String(20), default="pending")
    converted_lead_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    agent_run_id: Mapped[str] = mapped_column(String(36), default="")      # ties back to AgentAuditLogORM
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    notes: Mapped[str] = mapped_column(Text, default="")

    project: Mapped["ProjectORM"] = relationship("ProjectORM")


class AgentAuditLogORM(Base):
    """Immutable audit trail for every agent invocation — all AI decisions logged here."""
    __tablename__ = "agent_audit_log"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    agent_name: Mapped[str] = mapped_column(String(100))        # LeadScoringAgent, ProspectFinderAgent, etc.
    action: Mapped[str] = mapped_column(String(100))            # analyze_lead, find_prospects, etc.
    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)   # lead, project, etc.
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    input_summary: Mapped[str] = mapped_column(Text, default="")     # short description of inputs
    output_summary: Mapped[str] = mapped_column(Text, default="")    # short description of outputs
    confidence_score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0–100
    llm_used: Mapped[bool] = mapped_column(Boolean, default=False)   # True = real API call
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="success")  # success | error | fallback
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GestionCaseORM(Base):
    """Post-sale management case — Departamento de Gestión."""
    __tablename__ = "gestion_cases"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    client_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("clients.id"))
    unit_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("units.id"), nullable=True)
    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"))
    assigned_officer: Mapped[str] = mapped_column(String(100), default="")
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Document checklist
    doc_cedula: Mapped[str] = mapped_column(String(20), default="pendiente")          # pendiente/recibido
    doc_carta_trabajo: Mapped[str] = mapped_column(String(20), default="pendiente")
    doc_movimientos_bancarios: Mapped[str] = mapped_column(String(20), default="pendiente")
    doc_certificacion_vivienda: Mapped[str] = mapped_column(String(20), default="pendiente")
    # Fiduciaria workflow
    fiduciaria_status: Mapped[str] = mapped_column(String(40), default="recoleccion_firma")
    fiduciaria_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fiduciaria_history: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of {status, entered_at}
    # Contract & appointment
    contract_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    appointment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    appointment_time: Mapped[str | None] = mapped_column(String(10), nullable=True)   # "10:00"
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    client: Mapped["ClientORM"] = relationship("ClientORM")
    project: Mapped["ProjectORM"] = relationship("ProjectORM")


class PostventaCaseORM(Base):
    """After-sales case — Departamento de Postventa."""
    __tablename__ = "postventa_cases"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    client_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("clients.id"))
    unit_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("units.id"), nullable=True)
    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"))
    assigned_officer: Mapped[str] = mapped_column(String(100), default="")
    # Status machine: preinspeccion → en_revision → listo | correccion → entregado
    status: Mapped[str] = mapped_column(String(30), default="preinspeccion")
    status_history: Mapped[str] = mapped_column(Text, default="[]")   # JSON [{status, entered_at, exited_at}]
    # Inspection
    inspection_items: Mapped[str] = mapped_column(Text, default="[]") # JSON [{area, defects, notes, image_url}]
    inspection_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    constructor_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    client_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Delivery
    appointment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    warranty_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # delivery + 12 months
    convivencia_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    client: Mapped["ClientORM"] = relationship("ClientORM")
    project: Mapped["ProjectORM"] = relationship("ProjectORM")


class OfficerGoalORM(Base):
    """Management-assigned goals per officer/department per period."""
    __tablename__ = "officer_goals"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    department: Mapped[str] = mapped_column(String(50))          # cobros/finanzas/comercial/gestion/postventa
    officer_name: Mapped[str] = mapped_column(String(100))
    metric_name: Mapped[str] = mapped_column(String(100))        # e.g. "Monto cobrado", "Facturas registradas"
    metric_unit: Mapped[str] = mapped_column(String(30), default="RD$")  # RD$ / USD / unidades / %
    target_value: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    period: Mapped[str] = mapped_column(String(7))               # "YYYY-MM"
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class NotificationORM(Base):
    __tablename__ = "notifications"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    installment_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("installments.id"))
    client_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("clients.id"))
    channel: Mapped[str] = mapped_column(String(20))
    trigger: Mapped[str] = mapped_column(String(30))
    recipient: Mapped[str] = mapped_column(String(200))
    template_key: Mapped[str] = mapped_column(String(100))
    template_vars: Mapped[str] = mapped_column(Text, default="{}")  # JSON string
    status: Mapped[str] = mapped_column(String(20), default="pending")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LegalLetterORM(Base):
    """
    Demand letter (carta de cobro prejudicial) generated for a payment plan.
    One record per plan per generation run. Status tracks the letter lifecycle.
    """
    __tablename__ = "legal_letters"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    plan_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("payment_plans.id"))
    client_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("clients.id"))
    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"))
    unit_number: Mapped[str] = mapped_column(String(20), default="")
    # Status: generated → reviewed → signed → sent → delivered | voided
    status: Mapped[str] = mapped_column(String(20), default="generated")
    letter_text: Mapped[str] = mapped_column(Text)             # full letter content
    overdue_installments: Mapped[int] = mapped_column(Integer, default=0)
    total_overdue_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    signed_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    plan: Mapped["PaymentPlanORM"] = relationship("PaymentPlanORM")
    client: Mapped["ClientORM"] = relationship("ClientORM")


class PlanActivityORM(Base):
    """
    Append-only provenance log for every action taken on a payment plan.
    Captures: notifications sent, letters generated, payments registered,
    legal flags, plan approvals, and any other business event.
    """
    __tablename__ = "plan_activity"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    plan_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("payment_plans.id"), index=True)
    # action_type: notification_sent | letter_generated | payment_registered |
    #              plan_approved | legal_flagged | status_changed | note_added
    action_type: Mapped[str] = mapped_column(String(50))
    channel: Mapped[str | None] = mapped_column(String(30), nullable=True)  # whatsapp | email | legal_letter | system
    actor: Mapped[str] = mapped_column(String(100), default="system")       # officer name or "system"
    description: Mapped[str] = mapped_column(Text)                          # human-readable summary
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")          # extra data as JSON
    related_entity_id: Mapped[str | None] = mapped_column(String(100), nullable=True)  # notification/letter/installment id
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    plan: Mapped["PaymentPlanORM"] = relationship("PaymentPlanORM")


class CalendarEventORM(Base):
    """Business calendar event — covers all departments."""
    __tablename__ = "calendar_events"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    # gestion_appointment | postventa_inspection | postventa_delivery |
    # comercial_visit | cobros_followup | internal_meeting | other
    event_type: Mapped[str] = mapped_column(String(50))
    project_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    related_case_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    related_client_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)
    responsible_officer: Mapped[str] = mapped_column(String(100), default="")
    event_date: Mapped[date] = mapped_column(Date)
    start_time: Mapped[str] = mapped_column(String(5), default="09:00")
    end_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    # scheduled | completed | cancelled | rescheduled
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    location: Mapped[str] = mapped_column(String(200), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project: Mapped["ProjectORM | None"] = relationship("ProjectORM")
    client: Mapped["ClientORM | None"] = relationship("ClientORM")
