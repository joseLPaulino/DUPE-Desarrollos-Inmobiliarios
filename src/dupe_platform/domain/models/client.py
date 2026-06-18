"""Domain model: Client (buyer)."""
from __future__ import annotations
from dataclasses import dataclass
from uuid import UUID, uuid4


@dataclass
class Client:
    id: UUID
    first_name: str
    last_name: str
    id_number: str          # Cédula o pasaporte
    phone_whatsapp: str     # E.164 format, e.g. +18091234567
    email: str
    nationality: str = "Dominicana"
    notes: str = ""

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @classmethod
    def create(
        cls,
        first_name: str,
        last_name: str,
        id_number: str,
        phone_whatsapp: str,
        email: str,
        nationality: str = "Dominicana",
    ) -> "Client":
        return cls(
            id=uuid4(),
            first_name=first_name,
            last_name=last_name,
            id_number=id_number,
            phone_whatsapp=phone_whatsapp,
            email=email,
            nationality=nationality,
        )
