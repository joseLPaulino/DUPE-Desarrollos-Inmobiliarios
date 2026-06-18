"""Application configuration loaded from environment variables."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "DUPE Agentic Business Platform"
    app_env: str = "development"   # development | staging | production
    debug: bool = True

    # Database
    database_url: str = "postgresql+asyncpg://dupe:dupe@localhost:5432/dupe_platform"

    # WhatsApp [BLOCKED: A-WA — Meta Cloud API credentials pending account verification]
    whatsapp_access_token: str = "SYNTHETIC_TOKEN"
    whatsapp_phone_number_id: str = "SYNTHETIC_PHONE_ID"
    whatsapp_api_version: str = "v19.0"

    # Email [BLOCKED: A-EMAIL — SendGrid API key pending domain setup]
    sendgrid_api_key: str = "SYNTHETIC_SENDGRID_KEY"
    email_from: str = "cobros@dupedesa.com"

    # FX rate [A-FX: manual — set by management via API or env]
    usd_to_dop_rate: float = 58.50

    # Payment plan [A-APPROVAL: auto_activate=False until approver role confirmed]
    payment_plan_auto_activate: bool = False

    # Budget guard
    budget_guard_threshold_pct: float = 110.0

    # Seed data
    load_synthetic_data: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
