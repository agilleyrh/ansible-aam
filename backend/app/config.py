import json
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


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
    secret_key: str = "replace-this-in-production"
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:5173"])
    gateway_trusted_proxy: bool = True
    default_sync_interval_minutes: int = 5
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
