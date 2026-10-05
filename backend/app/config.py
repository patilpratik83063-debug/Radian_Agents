"""Runtime configuration, read from environment variables (see .env.example)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR.parent / ".env", BACKEND_DIR / ".env"),
        extra="ignore",
    )

    llm_base_url: str = "https://api.deepseek.com"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_concurrency: int = 6
    llm_timeout_seconds: int = 120

    engine_dir: Path = BACKEND_DIR.parent / "engine"
    ephemeral_ttl_minutes: int = 60
    brightdata_api_key: str = ""
    brightdata_zone: str = "serp_api1"
    google_api_key: str = ""
    script_timeout_seconds: int = 90
    audit_rate_limit_per_hour: int = 10

    demo_mode: bool = False
    cors_origins: str = "http://localhost:3100,http://127.0.0.1:3100,http://localhost:3000,http://127.0.0.1:3000"

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_api_key and self.llm_model and self.llm_base_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
