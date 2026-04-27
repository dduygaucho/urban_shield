"""Database session and engine (shared infrastructure for API + optional scripts)."""
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from pydantic_settings import BaseSettings, SettingsConfigDict


_API_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_API_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )
    database_url: str = "sqlite:///./urban_shield.db"
    cors_origins: str = ""
    ingest_enabled: bool = False
    ingest_interval_seconds: int = 1800
    ingest_rss_feeds: str = ""
    ingest_reddit_queries: str = "melbourne fight,melbourne robbery,geelong suspicious,melbourne attack"
    llm_verifier_enabled: bool = False
    llm_api_url: str = "https://api.openai.com/v1/chat/completions"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_min_confidence: float = 0.60
    llm_timeout_seconds: float = 20.0


settings = Settings()
# Resolve SQLite path relative to this package directory so uvicorn cwd varies safely
if settings.database_url.startswith("sqlite:///./"):
    db_name = settings.database_url.replace("sqlite:///./", "", 1)
    here = Path(__file__).resolve().parent
    _db_path = here / db_name
    DATABASE_URL = f"sqlite:///{_db_path}"
else:
    DATABASE_URL = settings.database_url

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
