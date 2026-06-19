"""
Integration test fixtures.

Tests run against the live Docker stack at http://localhost:8000.
Start the stack before running:
    docker compose up --build

Run integration tests:
    pytest tests/integration/ -v

Run unit tests only (no stack needed):
    pytest tests/unit/ -v
"""
import pytest
import httpx


BASE = "http://localhost:8000/api/v1"


@pytest.fixture(scope="session")
def client():
    """Synchronous HTTPX client for the running stack."""
    with httpx.Client(base_url=BASE, timeout=15) as c:
        yield c


@pytest.fixture(scope="session")
def projects(client):
    r = client.get("/projects/")
    assert r.status_code == 200, f"GET /projects/ failed: {r.text}"
    data = r.json()
    assert len(data) > 0, "No projects in DB — did you run docker compose up --build?"
    return data


@pytest.fixture(scope="session")
def social_project(projects):
    """First social-interest project (DOP currency)."""
    p = next((p for p in projects if p.get("project_type") == "social"), projects[0])
    return p


@pytest.fixture(scope="session")
def tourist_project(projects):
    """First tourist project (USD currency)."""
    p = next((p for p in projects if p.get("project_type") == "tourist"), None)
    return p


@pytest.fixture(scope="session")
def project_id(social_project):
    return social_project["id"]


@pytest.fixture(scope="session")
def dashboard(client, project_id):
    r = client.get(f"/dashboard/{project_id}")
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def first_partida_code(dashboard):
    partidas = dashboard.get("partida_kpis", [])
    assert partidas, "No partidas in dashboard — seed may be incomplete"
    return partidas[0]["code"]


@pytest.fixture(scope="session")
def plans(client, project_id):
    r = client.get(f"/payment-plans/project/{project_id}")
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def unpaid_installment(client, plans):
    """Return the first unpaid installment across all plans."""
    for plan in plans:
        r = client.get(f"/payment-plans/{plan['id']}/installments")
        if r.status_code != 200:
            continue
        detail = r.json()
        for inst in detail.get("installments", []):
            if inst["status"] != "paid":
                return inst, plan
    pytest.skip("No unpaid installments in seed data")
