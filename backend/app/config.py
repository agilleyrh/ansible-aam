import json
import logging
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

logger = logging.getLogger(__name__)

_INSECURE_SECRET_KEY = "replace-this-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AAM_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Advanced Automation Manager"
    environment: Literal["development", "staging", "production"] = "development"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://aam:aam@postgres:5432/aam"
    redis_url: str = "redis://redis:6379/0"
    secret_key: str = _INSECURE_SECRET_KEY
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:5173"])
    gateway_trusted_proxy: bool = True
    allow_dev_bypass: bool = False
    default_sync_interval_minutes: int = 5
    sync_job_timeout_minutes: int = 15
    scheduler_interval_seconds: int = 60
    search_result_limit: int = 25
    request_timeout_seconds: int = 15

    header_username: str = "x-rh-user"
    header_email: str = "x-rh-email"
    header_roles: str = "x-rh-roles"
    header_groups: str = "x-rh-groups"
    header_identity: str = "x-rh-identity"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        raw_value = value.strip()
        if not raw_value:
            return []
        if raw_value.startswith("["):
            parsed = json.loads(raw_value)
            if not isinstance(parsed, list):
                raise ValueError("cors_origins must be a list of strings")
            return [item.strip() for item in parsed if isinstance(item, str) and item.strip()]
        return [item.strip() for item in raw_value.split(",") if item.strip()]

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        if self.environment in ("staging", "production"):
            if self.secret_key == _INSECURE_SECRET_KEY:
                raise ValueError(
                    "AAM_SECRET_KEY must be set to a strong random value in staging/production. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )
            if self.allow_dev_bypass:
                raise ValueError("AAM_ALLOW_DEV_BYPASS must not be enabled in staging/production.")
        if self.environment == "development" and self.secret_key == _INSECURE_SECRET_KEY:
            logger.warning("Using default secret_key -- only acceptable for local development")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
