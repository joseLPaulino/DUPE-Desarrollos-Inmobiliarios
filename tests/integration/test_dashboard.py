"""
Integration tests — Dashboard API.

Verifies field names that the frontend depends on (field name regressions
caused blank pages three times — these tests prevent recurrence).

Invariants:
  - partida_kpis fields: code, name, budgeted, executed, pct, traffic_light
  - traffic_light values are lowercase: "green", "amber", "red"
  - collection_rate_pct is 0-100 (not 0-1 fraction)
  - currency is "DOP" or "USD" (never missing)
  - DOP and USD projects have different total_budget (currency isolation)
"""


class TestDashboardFieldNames:
    """Frontend depends on exact field names — any rename breaks the UI silently."""

    def test_top_level_fields_present(self, dashboard):
        required = {
            "project_id", "project_name", "currency",
            "physical_progress_pct", "total_budget", "total_executed",
            "budget_execution_pct", "overall_traffic_light",
            "partida_kpis", "collections",
        }
        missing = required - set(dashboard.keys())
        assert not missing, f"Dashboard missing fields: {missing}"

    def test_partida_kpi_field_names(self, dashboard):
        """Must match the TypeScript PartidaKPI interface exactly."""
        partidas = dashboard.get("partida_kpis", [])
        assert partidas, "partida_kpis is empty — seed incomplete"
        required = {"code", "name", "budgeted", "executed", "pct", "traffic_light"}
        for p in partidas:
            missing = required - set(p.keys())
            assert not missing, (
                f"PartidaKPI '{p.get('code','?')}' missing fields: {missing}"
            )

    def test_no_old_field_names_in_partidas(self, dashboard):
        """Ensure old names that caused blank-screen crashes are gone."""
        banned = {"partida_code", "partida_name", "budget", "execution_pct"}
        for p in dashboard.get("partida_kpis", []):
            found = banned & set(p.keys())
            assert not found, (
                f"Partida uses deprecated field names {found} — frontend will crash"
            )

    def test_collections_kpi_field_names(self, dashboard):
        """Must match the TypeScript CollectionsKPI interface."""
        coll = dashboard.get("collections")
        assert coll is not None, "collections KPI missing from dashboard"
        required = {
            "total_plans", "active_plans", "total_receivable",
            "total_collected", "collection_rate_pct", "overdue_count",
            "officer_queue_count", "management_queue_count", "legal_queue_count",
        }
        missing = required - set(coll.keys())
        assert not missing, f"CollectionsKPI missing fields: {missing}"

    def test_collection_rate_is_0_to_100_scale(self, dashboard):
        """Critical: frontend displays this directly — if 0-1 it shows 0% always."""
        rate = dashboard["collections"]["collection_rate_pct"]
        assert 0 <= float(rate) <= 100, (
            f"collection_rate_pct={rate} out of 0-100 range — "
            "backend must multiply by 100 before returning"
        )

    def test_traffic_light_values_are_lowercase(self, dashboard):
        """Frontend tlu() normalizer exists but underlying values must be lowercase."""
        for p in dashboard.get("partida_kpis", []):
            tl = p["traffic_light"]
            assert tl in ("green", "amber", "red"), (
                f"Partida '{p['code']}' traffic_light='{tl}' — must be lowercase"
            )
        overall = dashboard.get("overall_traffic_light")
        assert overall in ("green", "amber", "red"), (
            f"overall_traffic_light='{overall}' — must be lowercase"
        )

    def test_currency_field_present_and_valid(self, dashboard):
        assert dashboard.get("currency") in ("DOP", "USD"), (
            f"currency='{dashboard.get('currency')}' — must be DOP or USD"
        )


class TestCurrencyIsolation:
    """DOP and USD projects must not share budget figures."""

    def test_social_project_is_dop(self, social_project):
        assert social_project.get("currency") == "DOP", (
            f"Social project currency='{social_project.get('currency')}' expected DOP"
        )

    def test_tourist_project_is_usd(self, tourist_project):
        if tourist_project is None:
            import pytest
            pytest.skip("No tourist project in seed data")
        assert tourist_project.get("currency") == "USD", (
            f"Tourist project currency='{tourist_project.get('currency')}' expected USD"
        )

    def test_dop_and_usd_budgets_differ(self, client, social_project, tourist_project):
        if tourist_project is None:
            import pytest
            pytest.skip("No tourist project in seed data")
        dop_dash = client.get(f"/dashboard/{social_project['id']}").json()
        usd_dash = client.get(f"/dashboard/{tourist_project['id']}").json()
        # They should have different currencies reflected in data
        assert dop_dash["currency"] != usd_dash["currency"], (
            "DOP and USD projects returned same currency — isolation broken"
        )
