"""
Integration tests — Notification dispatch (deduplication invariant).

Architecture requirement (standing instructions):
  "Notification deduplication is mandatory — check schedule store before every dispatch"

Invariants:
  - POST /notifications/dispatch returns sent + skipped counts
  - Running dispatch twice in a row: second run skips everything sent in first
  - Simulated notifications do not throw 500
"""
import pytest


class TestNotificationDispatch:

    def test_dispatch_returns_required_fields(self, client):
        r = client.post("/notifications/dispatch")
        assert r.status_code == 200, f"Dispatch failed: {r.text}"
        data = r.json()
        required = {"sent", "skipped"}
        missing = required - set(data.keys())
        assert not missing, f"Dispatch response missing fields: {missing}"

    def test_sent_and_skipped_are_nonnegative_integers(self, client):
        r = client.post("/notifications/dispatch")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["sent"], int)   and data["sent"]    >= 0
        assert isinstance(data["skipped"], int) and data["skipped"] >= 0

    def test_deduplication_second_run_skips_already_sent(self, client):
        """
        Architecture invariant: dispatch must not send duplicate notifications.
        First run sends; second run (within same period) skips everything.
        """
        first = client.post("/notifications/dispatch")
        assert first.status_code == 200
        first_sent = first.json()["sent"]

        second = client.post("/notifications/dispatch")
        assert second.status_code == 200
        second_data = second.json()

        # If first run sent anything, second run must not re-send them
        if first_sent > 0:
            assert second_data["sent"] == 0, (
                f"Deduplication failed: second dispatch sent {second_data['sent']} "
                f"after first already sent {first_sent}. "
                "Check schedule_store / NotificationORM dedup logic."
            )
            assert second_data["skipped"] >= first_sent, (
                f"Second dispatch skipped={second_data['skipped']} "
                f"but first sent={first_sent} — some notifications unaccounted for"
            )
        else:
            # No notifications to send (seed may have no due/overdue installments
            # after payments in test_payments.py ran) — just verify it doesn't crash
            assert second_data["sent"] == 0
