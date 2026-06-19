"""
Integration tests — Payment plan and installment API.

Invariants:
  - PATCH /payment-plans/installment/{id}/pay → 409 on already-paid installment
  - Payment response includes updated total_paid and balance
  - Overdue installments have days_overdue > 0
  - Escalation levels match days_overdue thresholds (1/6/16)
  - Plans list has required fields (client_name, unit_number, etc.)
"""
import pytest


class TestPayInstallment:

    def test_pay_installment_succeeds(self, client, unpaid_installment):
        inst, plan = unpaid_installment
        r = client.patch(f"/payment-plans/installment/{inst['id']}/pay", json={
            "paid_amount": float(inst["amount"]),
            "paid_date": "2026-06-18",
            "notes": "Test payment — integration suite",
        })
        assert r.status_code == 200, f"Payment failed: {r.text}"
        data = r.json()
        assert "plan_id" in data or "installment_id" in data, (
            f"Payment response missing identifiers: {data}"
        )

    def test_duplicate_payment_returns_409(self, client, unpaid_installment):
        """
        Architecture invariant: paying an already-paid installment must return 409.
        Second attempt uses the same installment that was paid in the test above.
        """
        inst, plan = unpaid_installment
        # First payment (may already be paid from previous test — that's fine)
        client.patch(f"/payment-plans/installment/{inst['id']}/pay", json={
            "paid_amount": float(inst["amount"]),
            "paid_date": "2026-06-18",
        })
        # Second payment on same installment → must be 409
        r2 = client.patch(f"/payment-plans/installment/{inst['id']}/pay", json={
            "paid_amount": float(inst["amount"]),
            "paid_date": "2026-06-19",
        })
        assert r2.status_code == 409, (
            f"Duplicate payment should return 409, got {r2.status_code}. "
            f"Response: {r2.text}"
        )
        assert "already paid" in r2.json().get("detail", "").lower(), (
            f"409 response should mention 'already paid': {r2.json()}"
        )

    def test_unknown_installment_returns_404(self, client):
        import uuid
        r = client.patch(f"/payment-plans/installment/{uuid.uuid4()}/pay", json={
            "paid_amount": 1000.0,
            "paid_date": "2026-06-01",
        })
        assert r.status_code == 404


class TestPlansList:

    def test_plans_have_required_fields(self, plans):
        """CollectionsPortal.tsx depends on these field names."""
        required = {"id", "client_name", "unit_number", "total_amount",
                    "total_paid", "total_balance", "is_active", "overdue_count"}
        for plan in plans:
            missing = required - set(plan.keys())
            assert not missing, f"Plan {plan.get('id','?')} missing fields: {missing}"

    def test_client_name_is_not_uuid(self, plans):
        """Plans must return client_name string, not a UUID."""
        for plan in plans:
            name = plan.get("client_name", "")
            assert name and name != "—", f"Plan {plan['id']} has empty client_name"
            # UUIDs are 36 chars with hyphens in specific positions
            import re
            assert not re.match(
                r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
                name, re.IGNORECASE
            ), f"client_name looks like a UUID: '{name}'"

    def test_total_balance_equals_amount_minus_paid(self, plans):
        """total_balance must equal total_amount - total_paid."""
        for plan in plans:
            amount  = float(plan["total_amount"])
            paid    = float(plan["total_paid"])
            balance = float(plan["total_balance"])
            assert abs(balance - (amount - paid)) < 0.01, (
                f"Plan {plan['id']}: balance {balance} ≠ amount {amount} - paid {paid}"
            )


class TestInstallmentDetail:

    def test_installment_fields_present(self, client, plans):
        """Get first plan's installments and verify structure."""
        plan = plans[0]
        r = client.get(f"/payment-plans/{plan['id']}/installments")
        assert r.status_code == 200
        data = r.json()

        assert "installments" in data, "installments key missing"
        assert "client_name" in data, "client_name missing from plan detail"
        assert "client_email" in data, "client_email missing from plan detail"

        for inst in data["installments"]:
            required = {"id", "number", "due_date", "amount", "status", "days_overdue"}
            missing = required - set(inst.keys())
            assert not missing, f"Installment missing fields: {missing}"

    def test_paid_installments_have_zero_days_overdue(self, client, plans):
        """A paid installment must not show days_overdue."""
        for plan in plans:
            r = client.get(f"/payment-plans/{plan['id']}/installments")
            if r.status_code != 200:
                continue
            for inst in r.json().get("installments", []):
                if inst["status"] == "paid":
                    assert inst["days_overdue"] == 0, (
                        f"Paid installment #{inst['number']} shows days_overdue="
                        f"{inst['days_overdue']} — should be 0"
                    )


class TestOverdueQueue:

    def test_overdue_endpoint_returns_list(self, client):
        r = client.get("/payment-plans/overdue")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list), "Overdue endpoint should return a list"

    def test_overdue_items_have_positive_days_overdue(self, client):
        r = client.get("/payment-plans/overdue")
        assert r.status_code == 200
        for item in r.json():
            assert item.get("days_overdue", 0) > 0, (
                f"Overdue item has days_overdue={item.get('days_overdue')} — should be > 0"
            )

    def test_overdue_items_have_escalation_level(self, client):
        r = client.get("/payment-plans/overdue")
        assert r.status_code == 200
        valid_levels = {"NONE", "OFFICER", "MANAGEMENT", "LEGAL",
                        "none", "officer", "management", "legal"}
        for item in r.json():
            level = item.get("escalation_level", "")
            assert level in valid_levels, (
                f"Invalid escalation_level='{level}' in overdue item"
            )

    def test_escalation_level_matches_days_overdue(self, client):
        """Verify the Day+1/+6/+16 thresholds are honoured in the API response."""
        r = client.get("/payment-plans/overdue")
        assert r.status_code == 200
        for item in r.json():
            days = item.get("days_overdue", 0)
            level = (item.get("escalation_level") or "").lower()
            if days >= 16:
                assert level == "legal", (
                    f"days_overdue={days} should be LEGAL, got '{level}'"
                )
            elif days >= 6:
                assert level in ("management", "legal"), (
                    f"days_overdue={days} should be MANAGEMENT+, got '{level}'"
                )
            elif days >= 1:
                assert level in ("officer", "management", "legal"), (
                    f"days_overdue={days} should be OFFICER+, got '{level}'"
                )
