import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI

from app.config import settings
from app.db import get_store
from app.routers import agent, alerts, clarify, events, inventory, orders, recommendations, risk, simulate, suppliers
from app.services import alerts as alert_service
from app.services import event_stream
from app.services import risk as risk_service

log = logging.getLogger("ev_inventory")


def scan():
    try:
        store = get_store()
        if settings.scan_minutes > 0:
            risk_service.run_and_store(store, actor="scheduler")
            alert_service.pipeline_check(store)
    except Exception:
        log.exception("scheduled risk scan failed")


def drain_event_outbox():
    try:
        event_stream.drain_pending(get_store())
    except Exception:
        log.exception("scheduled Kafka outbox delivery failed")


@asynccontextmanager
async def lifespan(app):
    store = get_store()
    if settings.store == "memory":
        from app.nlu.entity_resolver import seed_aliases
        from sim.generate_data import load_demo

        load_demo(store, settings.today())
        seed_aliases(store)
        risk_service.run_and_store(store)
    scheduler = None
    if settings.scan_minutes > 0 or settings.kafka_bootstrap_servers:
        scheduler = BackgroundScheduler()
        if settings.scan_minutes > 0:
            scheduler.add_job(scan, "interval", minutes=settings.scan_minutes, max_instances=1)
        if settings.kafka_bootstrap_servers:
            scheduler.add_job(drain_event_outbox, "interval", minutes=1, max_instances=1)
        scheduler.start()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)
    event_stream.close()


app = FastAPI(title="EV Smart Inventory Intelligence", version="1.0.0", lifespan=lifespan)

if settings.cors_origins:
    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    )

for module in (events, inventory, orders, risk, simulate, suppliers, agent, clarify, recommendations, alerts):
    app.include_router(module.router, prefix="/api/v1")
