import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI

from app.config import settings
from app.db import get_store
from app.routers import agent, alerts, events, inventory, orders, recommendations, risk, simulate, suppliers
from app.services import alerts as alert_service
from app.services import risk as risk_service

log = logging.getLogger("ev_inventory")


def scan():
    try:
        risk_service.run_and_store(get_store(), actor="scheduler")
        alert_service.pipeline_check(get_store())
    except Exception:
        log.exception("scheduled risk scan failed")


@asynccontextmanager
async def lifespan(app):
    store = get_store()
    if settings.store == "memory":
        from sim.generate_data import load_demo

        load_demo(store, settings.today())
        risk_service.run_and_store(store)
    scheduler = None
    if settings.scan_minutes > 0:
        scheduler = BackgroundScheduler()
        scheduler.add_job(scan, "interval", minutes=settings.scan_minutes, max_instances=1)
        scheduler.start()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)


app = FastAPI(title="EV Smart Inventory Intelligence", version="1.0.0", lifespan=lifespan)

for module in (events, inventory, orders, risk, simulate, suppliers, agent, recommendations, alerts):
    app.include_router(module.router, prefix="/api/v1")
