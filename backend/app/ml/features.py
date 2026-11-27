CATEGORIES = ["CELL", "ELECTRONICS", "MECHANICAL", "SUBASSY"]
COUNTRIES = ["CN", "KR", "JP", "IN", "DE", "TW"]


def one_hot(value, values):
    return [1.0 if value == v else 0.0 for v in values]


def delay_features(reliability, category, lead_time, qty, typical_qty, month, recent_delay, country, moq):
    return [reliability, lead_time, qty / max(typical_qty, 1), month, recent_delay,
            1.0 if qty > 3 * max(moq, 1) else 0.0, *one_hot(category, CATEGORIES), *one_hot(country, COUNTRIES)]


def miss_features(slack, category, reliability, short_count, qty, utilization, days_to_crd):
    return [slack, reliability, short_count, qty, utilization, days_to_crd, *one_hot(category, CATEGORIES)]


def miss_row(state, order, allocations, risk, today):
    from datetime import date

    rows = [a for a in allocations if a["order_id"] == order["order_id"]]
    material = risk["bottleneck_material"]
    category = state.materials.get(material, {}).get("category")
    reliabilities = [state.suppliers[o["supplier_id"]].get("reliability", 0.9)
                     for o in state.supplier_materials if o["material_id"] == material]
    capacity = state.products[order["product_id"]].get("daily_capacity", 50)
    days = max((date.fromisoformat(order["crd"]) - today).days, 1)
    load = sum(o["qty"] for o in state.orders.values() if o["crd"] <= order["crd"])
    return miss_features(risk["slack_days"] if risk["slack_days"] is not None else -999, category,
                         max(reliabilities, default=1.0), sum(a["late_qty"] > 0 for a in rows), order["qty"],
                         load / (capacity * days), days)
