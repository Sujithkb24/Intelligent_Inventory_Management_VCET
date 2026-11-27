import copy
import json
from datetime import date, timedelta
from statistics import median

from app.config import settings
from app.services.allocation import material_need_by
from app.services.bom import explode
from app.services.risk import evaluate, shortages
from sim.generate_data import actual_world, build_world


def mean(values):
    return round(sum(values) / len(values), 2) if values else None


def with_predictions(state, today):
    from app.ml import predict

    trial = copy.deepcopy(state)
    for po in trial.purchase_orders.values():
        promised = date.fromisoformat(po["promised_date"])
        delay = predict.delay_days(trial, po["supplier_id"], po["material_id"], po["qty"], promised)
        po["predicted_date"] = (promised + timedelta(days=delay)).isoformat()
    return trial


def daily_shortage_detections(state, delays, today, use_ml=False):
    physical = copy.deepcopy(state)
    truth = actual_world(state, delays)
    arrivals = {
        po_id: date.fromisoformat(po["promised_date"]) + timedelta(days=po.get("delay_days", 0))
        for po_id, po in truth.purchase_orders.items()
    }
    requirements = {}
    need_dates = {}
    for order in state.orders.values():
        need_by = material_need_by(state, order)
        need_dates[order["order_id"]] = need_by
        for material_id, qty in explode(state, order["product_id"], order["qty"]).items():
            day = requirements.setdefault(need_by, {})
            day[material_id] = day.get(material_id, 0) + qty

    baseline_day, proposed_day, actual_day = {}, {}, {}
    last_day = max(need_dates.values(), default=today)
    for offset in range((last_day - today).days + 1):
        day = today + timedelta(days=offset)
        for po_id, arrival in list(arrivals.items()):
            if arrival <= day:
                po = physical.purchase_orders.pop(po_id)
                material = po["material_id"]
                physical.on_hand[material] = physical.on_hand.get(material, 0) + po["qty"]
                del arrivals[po_id]

        for material_id, material in physical.materials.items():
            if physical.on_hand.get(material_id, 0) <= material["reorder_level"]:
                baseline_day.setdefault(material_id, day)

        forecast = copy.deepcopy(physical)
        forecast.orders = {
            order_id: order for order_id, order in forecast.orders.items()
            if need_dates[order_id] >= day
        }
        if use_ml:
            forecast = with_predictions(forecast, day)
        allocations, _ = evaluate(forecast, day, use_ml)
        for item in shortages(forecast, allocations, day):
            proposed_day.setdefault(item["material_id"], day)

        for material_id, quantity in requirements.get(day, {}).items():
            available = physical.on_hand.get(material_id, 0)
            if available < quantity:
                actual_day.setdefault(material_id, day)
            physical.on_hand[material_id] = max(0, available - quantity)

    return {"actual": actual_day, "baseline": baseline_day, "proposed": proposed_day}


def detection_summary(shortage_runs):
    actual_total = sum(len(run["actual"]) for run in shortage_runs)
    paired_improvements = [
        (run["baseline"][material] - run["proposed"][material]).days
        for run in shortage_runs
        for material, actual_day in run["actual"].items()
        if material in run["baseline"] and material in run["proposed"]
        and run["baseline"][material] <= actual_day and run["proposed"][material] <= actual_day
    ]

    def summarize(detector):
        leads = [
            (actual_day - run[detector][material]).days
            for run in shortage_runs
            for material, actual_day in run["actual"].items()
            if material in run[detector] and run[detector][material] <= actual_day
        ]
        late = sum(
            material in run[detector] and run[detector][material] > actual_day
            for run in shortage_runs
            for material, actual_day in run["actual"].items()
        )
        false_flags = sum(
            material not in run["actual"]
            for run in shortage_runs
            for material in run[detector]
        )
        return {
            "flagged_materials": sum(len(run[detector]) for run in shortage_runs),
            "detected_before_or_on_shortage": len(leads),
            "detected_after_shortage": late,
            "missed": actual_total - len(leads),
            "false_flags": false_flags,
            "mean_lead_days": mean(leads),
            "median_lead_days": median(leads) if leads else None,
        }

    baseline_result, proposed_result = summarize("baseline"), summarize("proposed")
    return {
        "actual_shortages": actual_total,
        "baseline_reorder_level": baseline_result,
        "proposed_forecast": proposed_result,
        "paired_comparable_shortages": len(paired_improvements),
        "proposed_earlier_by_mean_days": mean(paired_improvements),
    }


def run(use_ml=False, seeds=range(300, 310), today=None):
    today = today or settings.today()
    settings.ml_enabled = False
    tp = fp = fn = tn = 0
    ship_errors, leads = [], []
    baseline_hits = proposed_hits = true_total = baseline_flags = proposed_flags = 0
    daily_runs = []
    for seed in seeds:
        state, delays = build_world(seed, today)
        view = with_predictions(state, today) if use_ml else state
        allocations, planned = evaluate(view, today, use_ml)
        truth_state = actual_world(state, delays)
        truth_allocations, truth = evaluate(truth_state, today, False)
        actual = {r["order_id"]: r for r in truth}
        for r in planned:
            real = actual[r["order_id"]]
            predicted, happened = r["risk_level"] == "HIGH", real["risk_level"] == "HIGH"
            tp += predicted and happened
            fp += predicted and not happened
            fn += happened and not predicted
            tn += not predicted and not happened
            if predicted and happened:
                leads.append((date.fromisoformat(r["crd"]) - today).days)
            if r["projected_ship_date"] and real["projected_ship_date"]:
                ship_errors.append(abs((date.fromisoformat(r["projected_ship_date"])
                                        - date.fromisoformat(real["projected_ship_date"])).days))
        true_short = {s["material_id"] for s in shortages(truth_state, truth_allocations, today)}
        proposed = {s["material_id"] for s in shortages(state, allocations, today)}
        baseline = {m for m, q in state.on_hand.items() if q <= state.materials[m]["reorder_level"]}
        true_total += len(true_short)
        baseline_hits += len(true_short & baseline)
        proposed_hits += len(true_short & proposed)
        baseline_flags += len(baseline)
        proposed_flags += len(proposed)
        daily_runs.append(daily_shortage_detections(state, delays, today, use_ml))
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    return {
        "scenarios": len(seeds), "orders": tp + fp + fn + tn,
        "order_risk": {"precision": round(precision, 3), "recall": round(recall, 3),
                       "f1": round(2 * precision * recall / (precision + recall), 3) if precision + recall else 0,
                       "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
                       "positive_rate": round((tp + fn) / (tp + fp + fn + tn), 3),
                       "ship_date_mae_days": mean(ship_errors), "mean_days_before_crd": mean(leads)},
        "material_shortages": {"true_total": true_total,
                               "baseline": {"detected": baseline_hits, "missed": true_total - baseline_hits,
                                            "flagged": baseline_flags},
                               "proposed": {"detected": proposed_hits, "missed": true_total - proposed_hits,
                                            "flagged": proposed_flags}},
        "day_by_day_detection": detection_summary(daily_runs),
    }


if __name__ == "__main__":
    from app.ml import predict

    report = {"rules_only": run()}
    if predict.load_model("delay") is not None:
        report["rules_plus_delay_model"] = run(use_ml=True)
    print(json.dumps(report, indent=2))
