"""Clients router."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dupe_platform.domain.models import Client
from dupe_platform.domain.ports import ClientRepository
from dupe_platform.adapters.inbound.api.deps import get_client_repo

router = APIRouter()


class ClientResponse(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    id_number: str
    phone_whatsapp: str
    email: str
    nationality: str

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"


@router.get("/", response_model=list[ClientResponse])
async def list_clients(repo: ClientRepository = Depends(get_client_repo)):
    clients = await repo.list_all()
    return [ClientResponse(**c.__dict__) for c in clients]


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(client_id: UUID, repo: ClientRepository = Depends(get_client_repo)):
    c = await repo.get(client_id)
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return ClientResponse(**c.__dict__)
