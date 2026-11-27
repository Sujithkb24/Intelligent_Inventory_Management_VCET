import json
import logging
import threading

from app import models
from app.config import settings
from app.db import now_iso

log = logging.getLogger("ev_inventory.kafka")
_producer = None
_producer_lock = threading.Lock()


def _get_producer():
    global _producer
    with _producer_lock:
        if _producer is None:
            from kafka import KafkaProducer

            _producer = KafkaProducer(
                bootstrap_servers=[server.strip() for server in settings.kafka_bootstrap_servers.split(",")],
                key_serializer=lambda value: value.encode("utf-8"),
                value_serializer=lambda value: json.dumps(value, separators=(",", ":")).encode("utf-8"),
                acks="all",
                retries=5,
            )
        return _producer


def drain_pending(store, limit=100):
    if not settings.kafka_bootstrap_servers:
        return 0
    pending = sorted(store.list(models.EVENT_OUTBOX, status="PENDING"),
                     key=lambda row: row["created_at"])[:limit]
    producer = _get_producer()
    published = 0
    for row in pending:
        try:
            producer.send(settings.kafka_topic, key=row["event_id"], value=row["payload"]).get(timeout=15)
        except Exception:
            log.exception("Kafka publish failed for outbox event %s", row["event_id"])
            raise
        store.set(models.EVENT_OUTBOX, row["event_id"],
                  {**row, "status": "SENT", "sent_at": now_iso()})
        published += 1
    return published


def close():
    global _producer
    with _producer_lock:
        if _producer is not None:
            _producer.close(timeout=5)
            _producer = None
