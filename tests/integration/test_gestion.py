"""
Integration tests — Departamento Gestión
Requires the Docker stack to be running: docker compose up --build
Run: pytest tests/integration/test_gestion.py -v
"""
import pytest
import httpx
from datetime import date, timedelta

BASE = "http://localhost:8000/api/v1"
FIDUCIARIA_STATES = ["recoleccion_firma", "enviado_fiduciaria", "cliente_vinculado"]


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE, timeout=15) as c:
        yield c


@pytest.fixture(scope="module")
def seed_ids(client):
    """Return project_id and client_id from seed data."""
    projects = client.get("/projects/").json()
    clients = client.get("/clients/").json()
    assert projects and clients
    return projects[0]["id"], clients[0]["id"]


@pytest.fixture(scope="module")
def created_case(client, seed_ids):
    """Create a fresh Gestión case for this test module."""
    project_id, client_id = seed_ids
    r = client.post("/gestion/cases", json={"client_id": client_id, "project_id": project_id, "notes": "test case"})
    assert r.status_code == 200
    return r.json()


# ── Cases ─────────────────────────────────────────────────────────────────────

class TestGestionCases:
    def test_list_cases(self, client):
        r = client.get("/gestion/cases")
        assert r.status_code == 200
        data = r.json()
        assert "cases" in data
        assert "total" in data

    def test_create_case_assigns_officer(self, client, seed_ids):
        project_id, client_id = seed_ids
        r = client.post("/gestion/cases", json={"client_id": client_id, "project_id": project_id})
        assert r.status_code == 200
        data = r.json()
        assert data["assigned_officer"]
        assert data["fiduciaria_status"] == "recoleccion_firma"
        # All docs start as pendiente
        for field in ["doc_cedula", "doc_carta_trabajo", "doc_movimientos_bancarios", "doc_certificacion_vivienda"]:
            assert data[field] == "pendiente"

    def test_get_case_by_id(self, client, created_case):
        r = client.get(f"/gestion/cases/{created_case['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == created_case["id"]

    def test_get_case_not_found(self, client):
        r = client.get("/gestion/cases/00000000-0000-0000-0000-000000000000")
        assert r.status_code == 404

    def test_filter_cases_by_fiduciaria_status(self, client):
        r = client.get("/gestion/cases", params={"fiduciaria_status": "recoleccion_firma"})
        assert r.status_code == 200
        for case in r.json()["cases"]:
            assert case["fiduciaria_status"] == "recoleccion_firma"


# ── Documents ─────────────────────────────────────────────────────────────────

class TestGestionDocuments:
    def test_update_single_document(self, client, created_case):
        r = client.patch(f"/gestion/cases/{created_case['id']}/documents",
                         json={"cedula": "recibido"})
        assert r.status_code == 200
        assert r.json()["doc_cedula"] == "recibido"

    def test_update_all_documents(self, client, created_case):
        payload = {
            "cedula": "recibido",
            "carta_trabajo": "recibido",
            "movimientos_bancarios": "recibido",
            "certificacion_vivienda": "recibido",
        }
        r = client.patch(f"/gestion/cases/{created_case['id']}/documents", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["doc_cedula"] == "recibido"
        assert data["doc_carta_trabajo"] == "recibido"
        assert data["doc_movimientos_bancarios"] == "recibido"
        assert data["doc_certificacion_vivienda"] == "recibido"

    def test_revert_document(self, client, created_case):
        r = client.patch(f"/gestion/cases/{created_case['id']}/documents",
                         json={"cedula": "pendiente"})
        assert r.status_code == 200
        assert r.json()["doc_cedula"] == "pendiente"


# ── Contract ──────────────────────────────────────────────────────────────────

class TestGestionContract:
    def test_generate_contract_requires_all_docs(self, client, created_case):
        """Contract generation should fail if docs are not complete."""
        # Reset one doc to pendiente
        client.patch(f"/gestion/cases/{created_case['id']}/documents",
                     json={"cedula": "pendiente"})
        r = client.patch(f"/gestion/cases/{created_case['id']}/contract")
        assert r.status_code == 400
        assert "documentos" in r.json()["detail"].lower()

    def test_generate_contract_all_docs_ready(self, client, created_case):
        # Receive all docs
        client.patch(f"/gestion/cases/{created_case['id']}/documents", json={
            "cedula": "recibido", "carta_trabajo": "recibido",
            "movimientos_bancarios": "recibido", "certificacion_vivienda": "recibido",
        })
        r = client.patch(f"/gestion/cases/{created_case['id']}/contract")
        assert r.status_code == 200
        assert r.json()["contract_generated_at"] is not None


# ── Appointment ───────────────────────────────────────────────────────────────

class TestGestionAppointment:
    def test_set_appointment(self, client, created_case):
        appt_date = (date.today() + timedelta(days=7)).isoformat()
        r = client.patch(f"/gestion/cases/{created_case['id']}/appointment",
                         json={"appointment_date": appt_date, "appointment_time": "09:00"})
        assert r.status_code == 200
        data = r.json()
        assert data["appointment_date"] == appt_date
        assert data["appointment_time"] == "09:00"

    def test_officer_availability_returns_slots(self, client, created_case):
        officer = created_case["assigned_officer"]
        r = client.get(f"/gestion/availability/{officer}")
        assert r.status_code == 200
        data = r.json()
        assert "slots" in data
        assert len(data["slots"]) > 0
        for slot in data["slots"]:
            assert "date" in slot
            assert "time" in slot


# ── Fiduciaria state machine ───────────────────────────────────────────────────

class TestFiduciariaStateMachine:
    def test_advance_recoleccion_to_enviado(self, client, created_case):
        r = client.patch(f"/gestion/cases/{created_case['id']}/fiduciaria",
                         json={"status": "enviado_fiduciaria", "notes": "Documentos enviados"})
        assert r.status_code == 200
        data = r.json()
        assert data["fiduciaria_status"] == "enviado_fiduciaria"
        assert len(data["fiduciaria_history"]) >= 1

    def test_advance_enviado_to_vinculado(self, client, created_case):
        r = client.patch(f"/gestion/cases/{created_case['id']}/fiduciaria",
                         json={"status": "cliente_vinculado"})
        assert r.status_code == 200
        assert r.json()["fiduciaria_status"] == "cliente_vinculado"

    def test_cannot_go_backwards(self, client, created_case):
        r = client.patch(f"/gestion/cases/{created_case['id']}/fiduciaria",
                         json={"status": "recoleccion_firma"})
        assert r.status_code == 400

    def test_cannot_skip_state(self, client, seed_ids):
        """A new case cannot jump directly from recoleccion_firma to cliente_vinculado."""
        project_id, client_id = seed_ids
        r = client.post("/gestion/cases", json={"client_id": client_id, "project_id": project_id})
        case_id = r.json()["id"]
        r = client.patch(f"/gestion/cases/{case_id}/fiduciaria",
                         json={"status": "cliente_vinculado"})
        assert r.status_code == 400

    def test_history_tracks_days_in_state(self, client, created_case):
        """Completed state transitions should have elapsed days recorded."""
        r = client.get(f"/gestion/cases/{created_case['id']}")
        history = r.json()["fiduciaria_history"]
        completed = [h for h in history if h.get("exited_at")]
        for entry in completed:
            assert entry["days_in_state"] is not None
            assert entry["days_in_state"] >= 0
