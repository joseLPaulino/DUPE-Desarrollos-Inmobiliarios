"""
Integration tests — Departamento Comercial
Requires the Docker stack to be running: docker compose up --build
Run: pytest tests/integration/test_comercial.py -v
"""
import pytest
import httpx

BASE = "http://localhost:8000/api/v1"


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE, timeout=15) as c:
        yield c


@pytest.fixture(scope="module")
def project_id(client):
    r = client.get("/projects/")
    assert r.status_code == 200
    projects = r.json()
    assert projects, "No projects in DB"
    return projects[0]["id"]


# ── Leads ─────────────────────────────────────────────────────────────────────

class TestLeads:
    def test_list_leads_empty_ok(self, client, project_id):
        r = client.get(f"/comercial/leads/{project_id}")
        assert r.status_code == 200
        data = r.json()
        assert "leads" in data
        assert "total" in data
        assert "by_status" in data

    def test_create_lead_required_fields(self, client, project_id):
        payload = {"first_name": "María", "last_name": "García", "phone": "8091234567",
                   "email": "maria@test.com", "source": "facebook"}
        r = client.post(f"/comercial/leads/{project_id}", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["full_name"] == "María García"
        assert data["status"] == "nuevo"
        assert data["assigned_seller"]  # round-robin assigned

    def test_create_lead_assigns_seller_round_robin(self, client, project_id):
        """Two leads should get sellers (may be same if only 1 seller)."""
        for i in range(3):
            payload = {"first_name": f"Lead{i}", "last_name": "Test"}
            r = client.post(f"/comercial/leads/{project_id}", json=payload)
            assert r.status_code == 200
            assert r.json()["assigned_seller"]

    def test_filter_leads_by_status(self, client, project_id):
        r = client.get(f"/comercial/leads/{project_id}", params={"status": "nuevo"})
        assert r.status_code == 200
        data = r.json()
        for lead in data["leads"]:
            assert lead["status"] == "nuevo"

    def test_update_lead_status(self, client, project_id):
        # Create a fresh lead
        r = client.post(f"/comercial/leads/{project_id}", json={"first_name": "Status", "last_name": "Test"})
        assert r.status_code == 200
        lead_id = r.json()["id"]

        # Advance to contactado
        r = client.patch(f"/comercial/leads/{lead_id}/status", json={"status": "contactado"})
        assert r.status_code == 200
        assert r.json()["status"] == "contactado"

    def test_update_lead_status_invalid(self, client, project_id):
        r = client.post(f"/comercial/leads/{project_id}", json={"first_name": "X", "last_name": "Y"})
        lead_id = r.json()["id"]
        r = client.patch(f"/comercial/leads/{lead_id}/status", json={"status": "invalido"})
        assert r.status_code == 400

    def test_lead_not_found(self, client):
        r = client.patch("/comercial/leads/00000000-0000-0000-0000-000000000000/status",
                         json={"status": "contactado"})
        assert r.status_code == 404


# ── Inventory ─────────────────────────────────────────────────────────────────

class TestInventory:
    def test_list_available_units(self, client, project_id):
        r = client.get(f"/comercial/inventory/{project_id}", params={"available_only": True})
        assert r.status_code == 200
        data = r.json()
        assert "units" in data
        assert "total_units" in data
        assert "available" in data
        assert "sold" in data
        assert "absorption_pct" in data
        for unit in data["units"]:
            assert not unit["is_sold"]

    def test_list_all_units(self, client, project_id):
        r = client.get(f"/comercial/inventory/{project_id}", params={"available_only": False})
        assert r.status_code == 200
        data = r.json()
        # Should include both sold and available
        assert data["total_units"] == data["available"] + data["sold"]

    def test_absorption_pct_range(self, client, project_id):
        r = client.get(f"/comercial/inventory/{project_id}")
        data = r.json()
        pct = data["absorption_pct"]
        assert 0.0 <= pct <= 100.0

    def test_toggle_unit_status(self, client, project_id):
        # Find an available unit
        r = client.get(f"/comercial/inventory/{project_id}", params={"available_only": True})
        units = r.json()["units"]
        if not units:
            pytest.skip("No available units")
        unit_id = units[0]["id"]

        # Mark as VENDIDO
        r = client.patch(f"/comercial/inventory/{unit_id}/status", params={"status": "VENDIDO"})
        assert r.status_code == 200
        assert r.json()["is_sold"] is True

        # Revert to DISPONIBLE
        r = client.patch(f"/comercial/inventory/{unit_id}/status", params={"status": "DISPONIBLE"})
        assert r.status_code == 200
        assert r.json()["is_sold"] is False


# ── Reserve ───────────────────────────────────────────────────────────────────

class TestReserve:
    def test_reserve_creates_payment_plan(self, client, project_id):
        # Get an available unit and a client
        inv_r = client.get(f"/comercial/inventory/{project_id}", params={"available_only": True})
        units = inv_r.json()["units"]
        if not units:
            pytest.skip("No available units for reservation test")
        unit_id = units[0]["id"]

        clients_r = client.get("/clients/")
        if clients_r.status_code != 200 or not clients_r.json():
            pytest.skip("No clients in DB")
        client_id = clients_r.json()[0]["id"]

        payload = {
            "unit_id": unit_id,
            "client_id": client_id,
            "sale_date": "2026-06-01",
            "total_amount": 1500000,
            "num_installments": 8,
            "notes": "Test reservation",
            "entered_by": "test_suite",
        }
        r = client.post(f"/comercial/reserve/{project_id}", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["plan"]["total_amount"] == 1500000
        assert data["plan"]["num_installments"] == 8
        assert len(data["installments"]) == 8
        assert data["unit"]["is_sold"] is True
        assert len(data["notifications"]) == 2  # whatsapp + email

    def test_reserve_already_sold_unit(self, client, project_id):
        # Find a sold unit (from previous test or seed)
        inv_r = client.get(f"/comercial/inventory/{project_id}", params={"available_only": False})
        sold = [u for u in inv_r.json()["units"] if u["is_sold"]]
        if not sold:
            pytest.skip("No sold units in DB")
        unit_id = sold[0]["id"]

        clients_r = client.get("/clients/")
        client_id = clients_r.json()[0]["id"]

        payload = {
            "unit_id": unit_id, "client_id": client_id,
            "sale_date": "2026-06-01", "total_amount": 1000000,
        }
        r = client.post(f"/comercial/reserve/{project_id}", json=payload)
        assert r.status_code == 409
