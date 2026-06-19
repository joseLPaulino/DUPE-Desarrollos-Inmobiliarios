"""
Unit tests — State machine logic for Gestión (Fiduciaria) and Postventa.
No running stack needed — pure Python logic tests.
Run: pytest tests/unit/test_state_machines.py -v
"""
import pytest
from datetime import date, timedelta

# ── Fiduciaria State Machine ──────────────────────────────────────────────────

FIDUCIARIA_TRANSITIONS = {
    "recoleccion_firma": ["enviado_fiduciaria"],
    "enviado_fiduciaria": ["cliente_vinculado"],
    "cliente_vinculado": [],
}


def can_advance_fiduciaria(current: str, target: str) -> bool:
    allowed = FIDUCIARIA_TRANSITIONS.get(current, [])
    return target in allowed


class TestFiduciariaStateMachine:
    def test_initial_state(self):
        assert can_advance_fiduciaria("recoleccion_firma", "enviado_fiduciaria") is True

    def test_second_transition(self):
        assert can_advance_fiduciaria("enviado_fiduciaria", "cliente_vinculado") is True

    def test_terminal_state_no_transitions(self):
        assert can_advance_fiduciaria("cliente_vinculado", "recoleccion_firma") is False
        assert can_advance_fiduciaria("cliente_vinculado", "enviado_fiduciaria") is False

    def test_cannot_skip_state(self):
        assert can_advance_fiduciaria("recoleccion_firma", "cliente_vinculado") is False

    def test_cannot_go_backwards(self):
        assert can_advance_fiduciaria("enviado_fiduciaria", "recoleccion_firma") is False
        assert can_advance_fiduciaria("cliente_vinculado", "enviado_fiduciaria") is False

    def test_invalid_current_state(self):
        assert can_advance_fiduciaria("unknown_state", "enviado_fiduciaria") is False

    def test_all_valid_forward_paths(self):
        path = ["recoleccion_firma", "enviado_fiduciaria", "cliente_vinculado"]
        for i in range(len(path) - 1):
            assert can_advance_fiduciaria(path[i], path[i + 1]) is True


# ── Postventa State Machine ───────────────────────────────────────────────────

POSTVENTA_TRANSITIONS = {
    "preinspeccion": [],           # only submitting inspection advances this
    "en_revision": ["listo", "correccion"],
    "listo": ["entregado"],
    "correccion": ["en_revision"],
    "entregado": [],
}


def can_advance_postventa(current: str, target: str) -> bool:
    return target in POSTVENTA_TRANSITIONS.get(current, [])


class TestPostventaStateMachine:
    def test_en_revision_can_go_listo(self):
        assert can_advance_postventa("en_revision", "listo") is True

    def test_en_revision_can_go_correccion(self):
        assert can_advance_postventa("en_revision", "correccion") is True

    def test_correccion_returns_to_en_revision(self):
        assert can_advance_postventa("correccion", "en_revision") is True

    def test_listo_goes_entregado(self):
        assert can_advance_postventa("listo", "entregado") is True

    def test_entregado_is_terminal(self):
        for state in ["preinspeccion", "en_revision", "listo", "correccion"]:
            assert can_advance_postventa("entregado", state) is False

    def test_preinspeccion_no_manual_transitions(self):
        """preinspeccion only advances via inspection submit, not manual status patch."""
        for state in ["en_revision", "listo", "correccion", "entregado"]:
            assert can_advance_postventa("preinspeccion", state) is False

    def test_listo_cannot_go_correccion(self):
        assert can_advance_postventa("listo", "correccion") is False

    def test_listo_cannot_go_en_revision(self):
        assert can_advance_postventa("listo", "en_revision") is False

    def test_correccion_cannot_go_listo_directly(self):
        assert can_advance_postventa("correccion", "listo") is False

    def test_full_happy_path(self):
        """preinspeccion → (inspect) → en_revision → listo → entregado"""
        # preinspeccion → en_revision is done by inspection submit, skip that
        assert can_advance_postventa("en_revision", "listo") is True
        assert can_advance_postventa("listo", "entregado") is True

    def test_correction_cycle(self):
        """en_revision → correccion → en_revision → listo"""
        assert can_advance_postventa("en_revision", "correccion") is True
        assert can_advance_postventa("correccion", "en_revision") is True
        assert can_advance_postventa("en_revision", "listo") is True


# ── Warranty Calculation ──────────────────────────────────────────────────────

def compute_warranty_expiry(delivery_date: date) -> date:
    """12-month warranty from delivery date."""
    # Mimic relativedelta(months=12) — add 12 months
    month = delivery_date.month + 12
    year = delivery_date.year + (month - 1) // 12
    month = ((month - 1) % 12) + 1
    try:
        return delivery_date.replace(year=year, month=month)
    except ValueError:
        # Handle month-end edge case (e.g., Jan 31 + 1 month = Feb 28)
        import calendar
        last_day = calendar.monthrange(year, month)[1]
        return delivery_date.replace(year=year, month=month, day=last_day)


class TestWarrantyCalculation:
    def test_standard_delivery(self):
        d = date(2026, 6, 1)
        expiry = compute_warranty_expiry(d)
        assert expiry == date(2027, 6, 1)

    def test_year_boundary(self):
        d = date(2026, 12, 15)
        expiry = compute_warranty_expiry(d)
        assert expiry == date(2027, 12, 15)

    def test_leap_year_boundary(self):
        d = date(2024, 2, 29)
        expiry = compute_warranty_expiry(d)
        assert expiry == date(2025, 2, 28)  # Feb 29 doesn't exist in 2025

    def test_warranty_is_exactly_365_ish_days(self):
        d = date(2026, 6, 1)
        expiry = compute_warranty_expiry(d)
        delta = (expiry - d).days
        assert 365 <= delta <= 366  # 365 non-leap, 366 if leap

    def test_days_remaining_decreases_over_time(self):
        d = date(2026, 1, 1)
        expiry = compute_warranty_expiry(d)
        days_remaining_now = (expiry - date(2026, 6, 1)).days
        days_remaining_later = (expiry - date(2026, 9, 1)).days
        assert days_remaining_now > days_remaining_later


# ── Installment Math ──────────────────────────────────────────────────────────

def compute_installments(total: float, num: int) -> list[float]:
    """Divide total into equal installments, with remainder on last."""
    base = int(total) // num
    amounts = [float(base)] * num
    remainder = total - base * num
    amounts[-1] += remainder
    return amounts


class TestInstallmentMath:
    def test_equal_split(self):
        amounts = compute_installments(1_200_000, 12)
        assert len(amounts) == 12
        assert all(a == 100_000 for a in amounts)

    def test_remainder_on_last(self):
        amounts = compute_installments(1_000_001, 3)
        assert amounts[0] == amounts[1] == 333_333.0
        assert amounts[-1] == pytest.approx(333_335.0)

    def test_total_matches(self):
        total = 1_750_000
        amounts = compute_installments(total, 8)
        assert sum(amounts) == pytest.approx(total)

    def test_single_installment(self):
        amounts = compute_installments(500_000, 1)
        assert amounts == [500_000.0]

    def test_minimum_installment_positive(self):
        amounts = compute_installments(1000, 16)
        assert all(a > 0 for a in amounts)


# ── Round-Robin Seller Assignment ─────────────────────────────────────────────

SELLERS = ["Ana Pérez", "Carlos Mejía", "Luisa Fernández"]


def assign_seller(existing_count: int) -> str:
    return SELLERS[existing_count % len(SELLERS)]


class TestRoundRobinAssignment:
    def test_first_lead_gets_first_seller(self):
        assert assign_seller(0) == SELLERS[0]

    def test_second_lead_gets_second_seller(self):
        assert assign_seller(1) == SELLERS[1]

    def test_wraps_around(self):
        assert assign_seller(3) == SELLERS[0]
        assert assign_seller(4) == SELLERS[1]

    def test_large_count(self):
        result = assign_seller(100)
        assert result in SELLERS

    def test_all_sellers_get_assigned(self):
        assigned = {assign_seller(i) for i in range(len(SELLERS) * 3)}
        assert assigned == set(SELLERS)
