"""
Integration tests — Budget execution API.

Invariants:
  - POST /reconciliation/execution → 422 when amount would push partida over 110%
  - POST /reconciliation/execution → 200 when within 110%
  - Response includes execution_pct, budgeted_amount, execution_id
  - Partida not found → 404
  - Project not found → 404
"""
import uuid


class TestBudgetGuardAPI:

    def test_small_execution_succeeds(self, client, project_id, first_partida_code):
        """A small execution (RD$1) must always succeed regardless of current state."""
        r = client.post("/reconciliation/execution", json={
            "project_id": project_id,
            "partida_code": first_partida_code,
            "amount": 1.0,
            "description": "Test execution — 1 unit",
            "entered_by": "test_suite",
        })
        assert r.status_code == 200, f"Small execution failed: {r.text}"
        data = r.json()
        assert "execution_id" in data
        assert "execution_pct" in data
        assert "budgeted_amount" in data

    def test_execution_response_fields(self, client, project_id, first_partida_code):
        r = client.post("/reconciliation/execution", json={
            "project_id": project_id,
            "partida_code": first_partida_code,
            "amount": 100.0,
            "description": "Field validation test",
            "entered_by": "test_suite",
        })
        assert r.status_code in (200, 422), f"Unexpected status: {r.status_code}"
        if r.status_code == 200:
            data = r.json()
            required = {"execution_id", "partida_code", "amount",
                        "total_executed", "budgeted_amount", "execution_pct"}
            missing = required - set(data.keys())
            assert not missing, f"Execution response missing fields: {missing}"

    def test_budget_guard_blocks_over_110pct(self, client, project_id, first_partida_code, dashboard):
        """Attempt to push one partida to 200% of budget — must return 422."""
        # Get the partida's budget amount from dashboard
        partidas = dashboard.get("partida_kpis", [])
        partida = next((p for p in partidas if p["code"] == first_partida_code), None)
        if not partida:
            import pytest; pytest.skip("Partida not found in dashboard")

        budgeted = float(partida["budgeted"])
        huge_amount = budgeted * 2  # 200% — guaranteed to trigger guard

        r = client.post("/reconciliation/execution", json={
            "project_id": project_id,
            "partida_code": first_partida_code,
            "amount": huge_amount,
            "description": "Budget guard test — intentionally over 110%",
            "entered_by": "test_suite",
        })
        assert r.status_code == 422, (
            f"Budget guard did not trigger — expected 422, got {r.status_code}. "
            f"Response: {r.text}"
        )
        # Error message should explain the issue
        detail = r.json().get("detail", "")
        assert "110%" in detail or "budget" in detail.lower(), (
            f"422 response detail doesn't mention budget limit: '{detail}'"
        )

    def test_unknown_partida_returns_404(self, client, project_id):
        r = client.post("/reconciliation/execution", json={
            "project_id": project_id,
            "partida_code": "NONEXISTENT-999",
            "amount": 1000.0,
            "description": "Should 404",
            "entered_by": "test_suite",
        })
        assert r.status_code == 404, f"Expected 404 for unknown partida, got {r.status_code}"

    def test_unknown_project_returns_404(self, client):
        r = client.post("/reconciliation/execution", json={
            "project_id": str(uuid.uuid4()),
            "partida_code": "ANY-001",
            "amount": 1000.0,
            "description": "Should 404",
            "entered_by": "test_suite",
        })
        assert r.status_code == 404, f"Expected 404 for unknown project, got {r.status_code}"


class TestManualTransaction:

    def test_transaction_without_partida_is_unmatched(self, client, project_id):
        r = client.post(f"/reconciliation/transaction/{project_id}", json={
            "description": "Test transaction — no partida",
            "amount": 50_000,
            "transaction_date": "2026-06-01",
        })
        assert r.status_code == 200, f"Transaction failed: {r.text}"
        data = r.json()
        assert data["status"] == "unmatched"
        assert data["execution_id"] is None

    def test_transaction_with_valid_partida_is_matched(self, client, project_id, first_partida_code):
        r = client.post(f"/reconciliation/transaction/{project_id}", json={
            "description": "Test transaction — with partida",
            "amount": -1_000,   # negative = expense
            "transaction_date": "2026-06-01",
            "partida_code": first_partida_code,
            "reference": "TEST-REF-001",
        })
        assert r.status_code in (200, 422), f"Unexpected status: {r.status_code}"
        if r.status_code == 200:
            data = r.json()
            assert data["status"] == "matched"
            assert data["execution_id"] is not None

    def test_transaction_response_has_required_fields(self, client, project_id):
        r = client.post(f"/reconciliation/transaction/{project_id}", json={
            "description": "Field check test",
            "amount": 1_000,
            "transaction_date": "2026-06-15",
        })
        assert r.status_code == 200
        required = {"transaction_id", "execution_id", "status", "amount", "transaction_date"}
        missing = required - set(r.json().keys())
        assert not missing, f"Transaction response missing fields: {missing}"
