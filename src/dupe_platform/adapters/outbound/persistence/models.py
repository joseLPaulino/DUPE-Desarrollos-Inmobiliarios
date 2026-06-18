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
