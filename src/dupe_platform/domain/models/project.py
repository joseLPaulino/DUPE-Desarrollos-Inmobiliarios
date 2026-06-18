"""Domain model: Project and Unit."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import Enum
from uuid import UUID, uuid4


class ProjectStatus(str, Enum):
    PLANNING     = "planning"
    CONSTRUCTION = "construction"
    DELIVERED    = "delivered"
    CLOSED       = "closed"


class ProjectType(str, Enum):
    SOCIAL_INTEREST = "social_interest"   # RD$
    TOURIST         = "tourist"           # USD  [A-TOURIST: assumed out of MVP scope per A11]


@dataclass
class Project:
    id: UUID
    name: str
    project_type: ProjectType
    status: ProjectStatus
    start_date: date
    expected_delivery_date: date
    total_units: int
    currency: str                      # "DOP" or "USD"
    total_budget: Decimal
    physical_progress_pct: Decimal = Decimal("0")  # [A-PHYS: manual entry by mgmt, no BIM]
    notes: str = ""

    @classmethod
    def create(
        cls,
        name: str,
        project_type: ProjectType,
        start_date: date,
        expected_delivery_date: date,
        total_units: int,
        total_budget: Decimal,
        currency: str = "DOP",
    ) -> "Project":
        return cls(
            id=uuid4(),
            name=name,
            project_type=project_type,
            status=ProjectStatus.CONSTRUCTION,
            start_date=start_date,
            expected_delivery_date=expected_delivery_date,
            total_units=total_units,
            currency=currency,
            total_budget=total_budget,
        )


@dataclass
class Unit:
    id: UUID
    project_id: UUID
    unit_number: str
    floor: int
    area_sqm: Decimal
    list_price: Decimal
    is_sold: bool = False
    client_id: UUID | None = None

    @classmethod
    def create(
        cls,
        project_id: UUID,
        unit_number: str,
        floor: int,
        area_sqm: Decimal,
        list_price: Decimal,
    ) -> "Unit":
        return cls(
            id=uuid4(),
            project_id=project_id,
            unit_number=unit_number,
            floor=floor,
            area_sqm=area_sqm,
            list_price=list_price,
        )
