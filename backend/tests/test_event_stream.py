from app import models
from app.config import settings
from app.db import MemoryStore
from app.services import event_stream


class Future:
    def get(self, timeout):
        assert timeout == 15
        return None


class Producer:
    def __init__(self):
        self.sent = []

    def send(self, topic, key, value):
        self.sent.append((topic, key, value))
        return Future()


def test_outbox_publishes_and_marks_event_sent(monkeypatch):
    store = MemoryStore()
    store.set(models.EVENT_OUTBOX, "EV-1", {
        "event_id": "EV-1", "payload": {"event_id": "EV-1"}, "status": "PENDING", "created_at": "1",
    })
    producer = Producer()
    monkeypatch.setattr(settings, "kafka_bootstrap_servers", "localhost:19092")
    monkeypatch.setattr(settings, "kafka_topic", "inventory.test")
    monkeypatch.setattr(event_stream, "_get_producer", lambda: producer)

    assert event_stream.drain_pending(store) == 1
    assert producer.sent == [("inventory.test", "EV-1", {"event_id": "EV-1"})]
    assert store.get(models.EVENT_OUTBOX, "EV-1")["status"] == "SENT"
