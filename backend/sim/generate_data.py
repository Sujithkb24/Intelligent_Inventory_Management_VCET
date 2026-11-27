import argparse
import copy
import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path

from app import models
from app.services.inventory import State
from app.services.ingestion import process_batch

MATERIALS = [
    ("CELL_21700", "CELL", 20000), ("BMS_V2", "ELECTRONICS", 200), ("PACK_CASE", "MECHANICAL", 200),
    ("MOTOR_HUB", "MECHANICAL", 150), ("CTRL_INV", "ELECTRONICS", 150), ("MCU_AUTO", "ELECTRONICS", 200),
    ("MCU_AUTO_B", "ELECTRONICS", 0), ("OBC_33", "ELECTRONICS", 50), ("HARNESS_S", "MECHANICAL", 200),
    ("DISPLAY_TFT", "ELECTRONICS", 150), ("PACK_3K", "SUBASSY", 0),
]
PRODUCTS = [("SCOOT_S", "EV scooter", 100), ("SCOOT_P", "EV scooter Pro", 80), ("HATCH_C", "Compact EV", 40)]
SCOOTER = {"PACK_3K": 1, "MOTOR_HUB": 1, "CTRL_INV": 1, "MCU_AUTO": 1, "HARNESS_S": 1, "DISPLAY_TFT": 1}
BOMS = {
    "PACK_3K": {"CELL_21700": 100, "BMS_V2": 1, "PACK_CASE": 1},
    "SCOOT_S": SCOOTER,
    "SCOOT_P": {**SCOOTER, "OBC_33": 1},
    "HATCH_C": {"PACK_3K": 8, "MOTOR_HUB": 2, "CTRL_INV": 2, "MCU_AUTO": 3, "OBC_33": 1,
                "HARNESS_S": 4, "DISPLAY_TFT": 1},
}
SUPPLIERS = [("SUP_A", "Supplier A", "TW", 0.92), ("SUP_B", "Supplier B", "CN", 0.80),
             ("SUP_C", "Supplier C", "KR", 0.90), ("SUP_D", "Supplier D", "IN", 0.95),
             ("SUP_E", "Supplier E", "DE", 0.88)]
OFFERS = [
    ("SUP_C", "CELL_21700", 28, 2.4, 5000, 500), ("SUP_B", "CELL_21700", 35, 2.1, 10000, 500),
    ("SUP_E", "BMS_V2", 21, 38.0, 100, 50), ("SUP_D", "PACK_CASE", 10, 22.0, 50, 10),
    ("SUP_D", "MOTOR_HUB", 14, 95.0, 50, 10), ("SUP_B", "CTRL_INV", 21, 60.0, 100, 20),
    ("SUP_A", "MCU_AUTO", 7, 17.0, 200, 50), ("SUP_B", "MCU_AUTO", 84, 14.0, 500, 100),
    ("SUP_E", "MCU_AUTO_B", 56, 19.0, 200, 50), ("SUP_E", "OBC_33", 21, 70.0, 20, 10),
    ("SUP_D", "HARNESS_S", 7, 12.0, 100, 20), ("SUP_B", "DISPLAY_TFT", 18, 25.0, 100, 20),
]


def master_data():
    return {
        models.MATERIALS: {m: {"material_id": m, "name": m.replace("_", " ").title(), "unit": "pcs",
                               "category": c, "reorder_level": r, "is_subassembly": c == "SUBASSY"}
                           for m, c, r in MATERIALS},
        models.PRODUCTS: {p: {"product_id": p, "name": n, "assembly_days_per_100": round(100 / cap, 2),
                              "testing_days": 1, "shipping_days": 2, "daily_capacity": cap}
                          for p, n, cap in PRODUCTS},
        models.BOM: {models.pair_id(p, c): {"parent_id": p, "child_id": c, "qty_per": q}
                     for p, children in BOMS.items() for c, q in children.items()},
        models.ALTERNATES: {models.pair_id("MCU_AUTO", "MCU_AUTO_B"):
                            {"material_id": "MCU_AUTO", "alternate_id": "MCU_AUTO_B"}},
        models.SUPPLIERS: {s: {"supplier_id": s, "name": n, "country": c, "reliability": r,
                               "single_source": s == "SUP_E", "recent_delay": round((1 - r) * 10, 2)}
                           for s, n, c, r in SUPPLIERS},
        models.SUPPLIER_MATERIALS: {models.pair_id(s, m): {
            "supplier_id": s, "material_id": m, "lead_time_days": lead, "unit_price": price, "moq": moq,
            "pack_size": pack, "typical_qty": moq * 2} for s, m, lead, price, moq, pack in OFFERS},
    }


def event(event_id, kind, ts, **fields):
    return {"event_id": event_id, "event_type": kind, "timestamp": ts.isoformat(), "source": "simulator", **fields}


def demo_events(today):
    ts = datetime.combine(today, datetime.min.time())
    stock = {"CELL_21700": 60000, "BMS_V2": 600, "PACK_CASE": 600, "MOTOR_HUB": 600, "CTRL_INV": 600,
             "MCU_AUTO": 300, "HARNESS_S": 600, "DISPLAY_TFT": 600, "OBC_33": 100}
    events = [event(f"SEED-STOCK-{m}", "INVENTORY_RECEIVED", ts, material_id=m, quantity=q)
              for m, q in stock.items()]
    for index, days in enumerate((14, 16, 18)):
        order_id = f"O10{index + 1}"
        events.append(event(f"SEED-{order_id}", "ORDER_CREATED", ts + timedelta(seconds=index + 1),
                            order_id=order_id, product_id="SCOOT_S", quantity=150,
                            crd=(today + timedelta(days=days)).isoformat()))
    return events


def load_master(store):
    for collection, docs in master_data().items():
        store.set_many(collection, docs)


def load_demo(store, today):
    load_master(store)
    return process_batch(store, demo_events(today))


def build_world(seed, today, order_count=200):
    rng = random.Random(seed)
    master = master_data()
    state = State(materials=master[models.MATERIALS], products=master[models.PRODUCTS],
                  suppliers=master[models.SUPPLIERS],
                  supplier_materials=list(master[models.SUPPLIER_MATERIALS].values()))
    for row in master[models.BOM].values():
        state.bom.setdefault(row["parent_id"], []).append(row)
    state.alternates = {"MCU_AUTO": ["MCU_AUTO_B"]}
    for index in range(order_count):
        product = rng.choices(["SCOOT_S", "SCOOT_P", "HATCH_C"], [6, 3, 1])[0]
        qty = rng.randint(2, 8) if product == "HATCH_C" else rng.randint(10, 40)
        if rng.random() < 0.03:
            qty *= 4
        order_id = f"O{1000 + index}"
        state.orders[order_id] = {"order_id": order_id, "product_id": product, "qty": qty, "status": "OPEN",
                                  "crd": (today + timedelta(days=rng.randint(7, 90))).isoformat(),
                                  "created_at": f"{index:05d}"}
    from app.services.bom import explode

    demand = {}
    for order in state.orders.values():
        for material, qty in explode(state, order["product_id"], order["qty"]).items():
            demand[material] = demand.get(material, 0) + qty
    delays = {}
    for material, total in demand.items():
        state.on_hand[material] = round(total * rng.uniform(0.3, 0.45))
        offer = next(o for o in state.supplier_materials if o["material_id"] == material)
        incoming = total * rng.uniform(0.6, 0.76)
        state.materials[material]["reorder_level"] = round(total * offer["lead_time_days"] / 90)
        for part in range(5):
            po_id = f"PO-{material}-{part}"
            state.purchase_orders[po_id] = {
                "po_id": po_id, "supplier_id": offer["supplier_id"], "material_id": material,
                "qty": round(incoming / 5), "status": "OPEN",
                "promised_date": (today + timedelta(days=8 + part * 16 + rng.randint(0, 7))).isoformat()}
            supplier = state.suppliers[offer["supplier_id"]]
            delays[po_id] = sample_delay(rng, supplier["reliability"], state.materials[material]["category"])
    return state, delays


def actual_world(state, delays):
    world = copy.deepcopy(state)
    for po_id, delay in delays.items():
        world.purchase_orders[po_id]["delay_days"] = delay
    return world


def sample_delay(rng, reliability, category):
    scale = {"CELL": 8.0, "ELECTRONICS": 6.0}.get(category, 2.5)
    usual = rng.gauss((1 - reliability) * scale * 2, 0.8)
    tail = rng.expovariate(1 / scale) if rng.random() > reliability else 0
    return max(0, round(usual + tail))


def po_history(rng, per_day=8, days=90):
    master = master_data()
    start = date(2026, 1, 1)
    history = []
    for day in range(1, days + 1):
        for _ in range(per_day):
            offer = rng.choice(list(master[models.SUPPLIER_MATERIALS].values()))
            supplier = master[models.SUPPLIERS][offer["supplier_id"]]
            category = master[models.MATERIALS][offer["material_id"]]["category"]
            qty = offer["moq"] * rng.randint(1, 6)
            delay = sample_delay(rng, supplier["reliability"] - (0.1 if qty > 3 * offer["moq"] else 0), category)
            history.append({"day": day, "month": (start + timedelta(days=day - 1)).month, "qty": qty,
                            "supplier_id": offer["supplier_id"], "reliability": supplier["reliability"],
                            "country": supplier["country"], "category": category,
                            "lead_time_days": offer["lead_time_days"], "typical_qty": offer["typical_qty"],
                            "moq": offer["moq"], "actual_delay_days": delay})
    return history


def event_stream(seed=7, valid=9400, duplicates=500, malformed=100):
    rng = random.Random(seed)
    ts = datetime(2026, 1, 1)
    leaves = [m for m, c, _ in MATERIALS if c != "SUBASSY"]
    events = [event(f"OPEN-{m}", "INVENTORY_RECEIVED", ts, material_id=m, quantity=1000000) for m in leaves]
    for index in range(valid - len(leaves)):
        kind = rng.choice(["INVENTORY_RECEIVED", "INVENTORY_ISSUED", "INVENTORY_ADJUSTED"])
        qty = rng.randint(1, 50) * (rng.choice([-1, 1]) if kind == "INVENTORY_ADJUSTED" else 1)
        events.append(event(f"EVT-{index:06d}", kind, ts + timedelta(seconds=index + 1),
                            material_id=rng.choice(leaves), quantity=qty))
    repeats = [dict(rng.choice(events)) for _ in range(duplicates)]
    broken = [{"event_id": f"BAD-{i:04d}", "event_type": "UNKNOWN", "quantity": "x"} for i in range(malformed)]
    tail = events[len(leaves):] + broken
    rng.shuffle(tail)
    return events[:len(leaves)] + tail + repeats


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent / "data"))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    state, delays = build_world(args.seed, date.today())
    files = {"master": master_data(), "demo_events": demo_events(date.today()),
             "orders": list(state.orders.values()), "po_history": po_history(random.Random(args.seed)),
             "event_stream": event_stream(args.seed)}
    for name, content in files.items():
        (out / f"{name}.json").write_text(json.dumps(content, indent=1))
    print(f"wrote {len(files)} files to {out}")


if __name__ == "__main__":
    main()
