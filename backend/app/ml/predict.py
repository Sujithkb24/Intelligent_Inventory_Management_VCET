from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

from app import models
from app.ml import features

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


@lru_cache(maxsize=4)
def _load_artifact(name, mtime_ns, size):
    import joblib

    return joblib.load(ARTIFACTS / f"{name}.joblib")


def load_model(name):
    path = ARTIFACTS / f"{name}.joblib"
    if not path.exists():
        return None
    stat = path.stat()
    return _load_artifact(name, stat.st_mtime_ns, stat.st_size)


def delay_days(state, supplier_id, material_id, qty, today):
    model = load_model("delay")
    offer = next((o for o in state.supplier_materials
                  if o["supplier_id"] == supplier_id and o["material_id"] == material_id), None)
    if model is None or offer is None:
        return 0
    supplier = state.suppliers[supplier_id]
    row = features.delay_features(
        supplier.get("reliability", 0.9), state.materials[material_id].get("category"), offer["lead_time_days"],
        qty, offer.get("typical_qty", offer.get("moq", 1)), today.month, supplier.get("recent_delay", 0),
        supplier.get("country"), offer.get("moq", 1))
    return max(int(round(float(model.predict([row])[0]))), 0)


def save_prediction(store, po_id, predicted):
    def run(tx):
        current = tx.get(models.PURCHASE_ORDERS, po_id)
        if current:
            tx.set(models.PURCHASE_ORDERS, po_id, {**current, "predicted_date": predicted})

    store.atomic(run)


def apply_delay_predictions(store, state):
    if load_model("delay") is None:
        return 0
    count = 0
    for po in state.purchase_orders.values():
        promised = date.fromisoformat(po["promised_date"])
        delay = delay_days(state, po["supplier_id"], po["material_id"], po["qty"], promised)
        predicted = (promised + timedelta(days=delay)).isoformat()
        if po.get("predicted_date") != predicted:
            po["predicted_date"] = predicted
            save_prediction(store, po["po_id"], predicted)
        count += 1
    return count


def apply_miss_probability(state, allocations, risks, today):
    model = load_model("miss")
    if model is None or not risks:
        return 0
    rows = [features.miss_row(state, state.orders[r["order_id"]], allocations, r, today) for r in risks]
    for r, probability in zip(risks, model.predict_proba(rows)[:, 1]):
        r["miss_probability"] = round(float(probability), 4)
    return sum(r["miss_probability"] is not None for r in risks)
