"""SQLAlchemy implementation of ClientRepository."""
from __future__ import annotations
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.domain.models import Client
from dupe_platform.domain.ports.repositories import ClientRepository
from ..models import ClientORM


class SqlClientRepository(ClientRepository):

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    @staticmethod
    def _to_domain(row: ClientORM) -> Client:
        return Client(
            id=row.id,
            first_name=row.first_name,
            last_name=row.last_name,
            id_number=row.id_number,
            phone_whatsapp=row.phone_whatsapp,
            email=row.email,
            nationality=row.nationality,
            notes=row.notes or "",
        )

    async def get(self, client_id: UUID) -> Client | None:
        row = await self._s.get(ClientORM, client_id)
        return self._to_domain(row) if row else None

    async def list_all(self) -> list[Client]:
        result = await self._s.execute(
            select(ClientORM).order_by(ClientORM.last_name, ClientORM.first_name)
        )
        return [self._to_domain(r) for r in result.scalars()]

    async def save(self, client: Client) -> None:
        existing = await self._s.get(ClientORM, client.id)
        if existing:
            existing.first_name = client.first_name
            existing.last_name = client.last_name
            existing.phone_whatsapp = client.phone_whatsapp
            existing.email = client.email
            existing.nationality = client.nationality
            existing.notes = client.notes
        else:
            self._s.add(ClientORM(
                id=client.id,
                first_name=client.first_name,
                last_name=client.last_name,
                id_number=client.id_number,
                phone_whatsapp=client.phone_whatsapp,
                email=client.email,
                nationality=client.nationality,
                notes=client.notes,
            ))
        await self._s.flush()

    async def find_by_id_number(self, id_number: str) -> Client | None:
        result = await self._s.execute(
            select(ClientORM).where(ClientORM.id_number == id_number).limit(1)
        )
        row = result.scalar_one_or_none()
        return self._to_domain(row) if row else None
