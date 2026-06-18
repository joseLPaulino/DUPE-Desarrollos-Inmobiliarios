"""Application configuration — loaded from .env via pydantic-settings.

All external system connections (DB, WhatsApp, SendGrid) are configured here.
No connection strings or credentials should appear anywhere else in the codebase.

[A-WA]    WhatsApp tokens: set real values when Meta Business Account is verified.
[A-EMAIL] SendGrid key: set real value when cobros@dupedesa.com domain is confirmed.
[A-FX]    USD_TO_DOP_RATE: update manually when management adjusts the rate.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────────────────────────
    app_name: str = "DUPE Agentic Business Platform"
    app_env: str = "development"    # development | staging | production
    debug: bool = True

    # ── PostgreSQL ────────────────────────────────────────────────────────────
    # Accepts either a full DATABASE_URL or individual POSTGRES_* parts.
    # The full URL wins if set; otherwise it is assembled from parts.
    database_url: str = ""
    postgres_user: str = "dupe"
    postgres_password: str = "dupe"
    postgres_db: str = "dupe_platform"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    @property
    def effective_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # ── WhatsApp [A-WA] ───────────────────────────────────────────────────────
    whatsapp_access_token: str = "SYNTHETIC_TOKEN"
    whatsapp_phone_number_id: str = "SYNTHETIC_PHONE_ID"
    whatsapp_api_version: str = "v19.0"

    @property
    def whatsapp_enabled(self) -> bool:
        return self.whatsapp_access_token not in ("SYNTHETIC_TOKEN", "", "your_meta_token_here")

    # ── Email [A-EMAIL] ───────────────────────────────────────────────────────
    sendgrid_api_key: str = "SYNTHETIC_SENDGRID_KEY"
    email_from: str = "cobros@dupedesa.com"

    @property
    def email_enabled(self) -> bool:
        return self.sendgrid_api_key not in ("SYNTHETIC_SENDGRID_KEY", "", "your_sendgrid_key_here")

    # ── FX rate [A-FX] ────────────────────────────────────────────────────────
    usd_to_dop_rate: float = 58.50

    # ── Business rules ────────────────────────────────────────────────────────
    payment_plan_auto_activate: bool = False
    budget_guard_threshold_pct: float = 110.0

    # ── OpenAI ────────────────────────────────────────────────────────────────
    # Used by LangGraph agents (Reconciliation, Financial Intelligence, Reporting)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    @property
    def llm_enabled(self) -> bool:
        return bool(self.openai_api_key) and not self.openai_api_key.startswith("sk-YOUR")

    # ── Seed ─────────────────────────────────────────────────────────────────
    load_synthetic_data: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
