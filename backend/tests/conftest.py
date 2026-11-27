from datetime import date

import pytest

from app.config import settings
from app.db import MemoryStore, set_store
from sim.generate_data import load_demo

TODAY = date(2026, 11, 27)


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    for name, value in (("store", "memory"), ("ml_enabled", False), ("llm_provider", "rules"),
                        ("auto_recompute", False), ("scan_minutes", 0), ("api_key", ""),
                        ("today_override", TODAY.isoformat()), ("po_buffer_pct", 0.10),
                        ("risk_buffer_days", 2), ("max_tool_calls", 8)):
        monkeypatch.setattr(settings, name, value)


@pytest.fixture
def store():
    memory = MemoryStore()
    set_store(memory)
    load_demo(memory, TODAY)
    yield memory
    set_store(None)
