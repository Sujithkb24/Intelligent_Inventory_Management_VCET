from app.db import CachedStore, MemoryStore


class FakeRedis:
    def __init__(self):
        self.values = {}

    def setnx(self, key, value):
        self.values.setdefault(key, value)

    def get(self, key):
        return self.values.get(key)

    def setex(self, key, _ttl, value):
        self.values[key] = value

    def incr(self, key):
        self.values[key] = str(int(self.values[key]) + 1)


def test_cached_store_invalidates_reads_after_writes():
    store = CachedStore(MemoryStore(), FakeRedis(), 5, "test")
    store.set("materials", "M", {"material_id": "M", "name": "old"})
    assert store.get("materials", "M")["name"] == "old"
    store.set("materials", "M", {"material_id": "M", "name": "new"})
    assert store.get("materials", "M")["name"] == "new"
