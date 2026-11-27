import copy
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app import models
from app.config import ROOT, settings


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"


class MemoryTx:
    def __init__(self, store):
        self.store = store
        self.writes = []

    def get(self, collection, doc_id):
        return self.store.get(collection, doc_id)

    def set(self, collection, doc_id, data):
        self.writes.append((collection, doc_id, copy.deepcopy(data)))


class MemoryStore:
    def __init__(self):
        self.data = {}
        self.lock = threading.RLock()

    def get(self, collection, doc_id):
        with self.lock:
            return copy.deepcopy(self.data.get(collection, {}).get(doc_id))

    def set(self, collection, doc_id, data):
        with self.lock:
            self.data.setdefault(collection, {})[doc_id] = copy.deepcopy(data)

    def delete(self, collection, doc_id):
        with self.lock:
            self.data.get(collection, {}).pop(doc_id, None)

    def list(self, collection, **filters):
        with self.lock:
            return [copy.deepcopy(d) for d in self.data.get(collection, {}).values()
                    if all(d.get(k) == v for k, v in filters.items())]

    def clear(self, collection):
        with self.lock:
            self.data[collection] = {}

    def set_many(self, collection, docs):
        for doc_id, data in docs.items():
            self.set(collection, doc_id, data)

    def atomic(self, fn):
        with self.lock:
            tx = MemoryTx(self)
            result = fn(tx)
            for write in tx.writes:
                self.set(*write)
            return result


class FirestoreTx:
    def __init__(self, store, transaction):
        self.store = store
        self.transaction = transaction

    def get(self, collection, doc_id):
        return self.store.ref(collection, doc_id).get(transaction=self.transaction).to_dict()

    def set(self, collection, doc_id, data):
        self.transaction.set(self.store.ref(collection, doc_id), data)


class FirestoreStore:
    def __init__(self, project_id="", credentials_path="", prefix=""):
        if os.getenv("FIRESTORE_EMULATOR_HOST"):
            from google.cloud import firestore

            self.client = firestore.Client(project=project_id or "demo-ev")
        else:
            import firebase_admin
            from firebase_admin import credentials, firestore

            if not firebase_admin._apps:
                cred = None
                if credentials_path:
                    path = Path(credentials_path)
                    cred = credentials.Certificate(str(path if path.is_absolute() else ROOT / path))
                options = {"projectId": project_id} if project_id else None
                firebase_admin.initialize_app(cred, options)
            self.client = firestore.client()
        self.prefix = prefix

    def col(self, collection):
        return self.client.collection(self.prefix + collection)

    def ref(self, collection, doc_id):
        return self.col(collection).document(doc_id)

    def get(self, collection, doc_id):
        return self.ref(collection, doc_id).get().to_dict()

    def set(self, collection, doc_id, data):
        self.ref(collection, doc_id).set(data)

    def delete(self, collection, doc_id):
        self.ref(collection, doc_id).delete()

    def list(self, collection, **filters):
        from google.cloud.firestore_v1.base_query import FieldFilter

        query = self.col(collection)
        for key, value in filters.items():
            query = query.where(filter=FieldFilter(key, "==", value))
        return [doc.to_dict() for doc in query.stream()]

    def clear(self, collection):
        refs = list(self.col(collection).list_documents())
        for start in range(0, len(refs), 400):
            batch = self.client.batch()
            for ref in refs[start:start + 400]:
                batch.delete(ref)
            batch.commit()

    def set_many(self, collection, docs):
        items = list(docs.items())
        for start in range(0, len(items), 400):
            batch = self.client.batch()
            for doc_id, data in items[start:start + 400]:
                batch.set(self.ref(collection, doc_id), data)
            batch.commit()

    def atomic(self, fn):
        from google.cloud import firestore

        @firestore.transactional
        def run(transaction):
            return fn(FirestoreTx(self, transaction))

        return run(self.client.transaction())


_store = None


def get_store():
    global _store
    if _store is None:
        if settings.store == "memory":
            _store = MemoryStore()
        else:
            _store = FirestoreStore(settings.project_id, settings.credentials, settings.prefix)
    return _store


def set_store(store):
    global _store
    _store = store


def audit(store, actor, action, ref_id, detail=None):
    entry_id = new_id("AUD")
    store.set(models.AUDIT, entry_id, {"id": entry_id, "actor": actor, "action": action,
                                       "ref_id": ref_id, "detail": detail or {}, "ts": now_iso()})
