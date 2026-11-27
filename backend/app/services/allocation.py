from datetime import date, timedelta
from math import ceil

from app.services.bom import explode
from app.services.inventory import supply_timeline


def sorted_orders(state):
    return sorted(state.orders.values(), key=lambda o: (o["crd"], o.get("created_at", ""), o["order_id"]))


def consume(entries, qty, need_by=None):
    got, in_time, ready = 0, 0, None
    for entry in entries:
        if got >= qty:
            break
        take = min(entry[1], qty - got)
        if take <= 0:
            continue
        entry[1] -= take
        got += take
        ready = entry[0]
        if need_by is None or entry[0] <= need_by:
            in_time += take
    covered = got >= qty - 1e-9
    return (ready if covered else None), got, in_time


def production_days(product, qty):
    return max(1, ceil(qty / max(product.get("daily_capacity", 50), 1)))


def material_need_by(state, order):
    product = state.products[order["product_id"]]
    tail = production_days(product, order["qty"]) + product.get("testing_days", 1) + product.get("shipping_days", 2)
    return date.fromisoformat(order["crd"]) - timedelta(days=tail)


def run_allocation(state, today, use_prediction=True):
    supply = supply_timeline(state, today, use_prediction)
    results = []
    for order in sorted_orders(state):
        need_by = material_need_by(state, order)
        for material_id, qty in explode(state, order["product_id"], order["qty"]).items():
            ready, got, in_time = consume(supply.get(material_id, []), qty, max(need_by, today))
            late = qty - in_time if need_by >= today else qty - (in_time if ready == today else 0)
            results.append({"order_id": order["order_id"], "material_id": material_id, "required": qty,
                            "allocated": got, "ready_date": ready.isoformat() if ready else None,
                            "need_by": need_by.isoformat(), "late_qty": max(late, 0)})
    return results
