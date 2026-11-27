import os
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_env(path=ROOT / ".env"):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"'))


load_env()


def env(name, default=""):
    return field(default_factory=lambda: os.getenv(name, default))


def env_bool(name, default):
    return field(default_factory=lambda: os.getenv(name, default).lower() in ("1", "true", "yes"))


def env_num(name, default, cast=int):
    return field(default_factory=lambda: cast(os.getenv(name, default)))


@dataclass
class Settings:
    store: str = env("STORE", "firestore")
    project_id: str = env("FIREBASE_PROJECT_ID")
    credentials: str = env("FIREBASE_CREDENTIALS")
    prefix: str = env("COLLECTION_PREFIX")
    api_key: str = env("API_KEY")
    auth_mode: str = env("AUTH_MODE", "firebase")
    role_claim: str = env("FIREBASE_ROLE_CLAIM", "role")
    cors_origins: str = env("CORS_ORIGINS")
    llm_provider: str = env("LLM_PROVIDER", "auto")
    anthropic_key: str = env("ANTHROPIC_API_KEY")
    model: str = env("ANTHROPIC_MODEL", "claude-sonnet-5-5")
    ml_enabled: bool = env_bool("ML_ENABLED", "true")
    auto_recompute: bool = env_bool("AUTO_RECOMPUTE", "true")
    scan_minutes: int = env_num("SCAN_MINUTES", "30")
    risk_buffer_days: int = env_num("RISK_BUFFER_DAYS", "2")
    po_buffer_pct: float = env_num("PO_BUFFER_PCT", "0.10", float)
    max_tool_calls: int = env_num("MAX_TOOL_CALLS", "8")
    reliability_floor: float = env_num("RELIABILITY_FLOOR", "0.85", float)
    stale_event_minutes: int = env_num("STALE_EVENT_MINUTES", "60")
    reject_rate_threshold: float = env_num("REJECT_RATE_THRESHOLD", "0.05", float)
    duplicate_threshold: int = env_num("DUPLICATE_THRESHOLD", "50")
    keep_runs: int = env_num("KEEP_RUNS", "5")
    today_override: str = env("TODAY")
    kafka_bootstrap_servers: str = env("KAFKA_BOOTSTRAP_SERVERS")
    kafka_topic: str = env("KAFKA_TOPIC", "inventory.events")
    redis_url: str = env("REDIS_URL")
    redis_cache_ttl: int = env_num("REDIS_CACHE_TTL", "5")

    def today(self):
        return date.fromisoformat(self.today_override) if self.today_override else date.today()


settings = Settings()
