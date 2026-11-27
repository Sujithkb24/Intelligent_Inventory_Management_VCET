import copy
import json
from datetime import date, timedelta

from app.config import settings
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


def run(use_ml=False, seeds=range(300, 310), today=None):
    today = today or settings.today()
    settings.ml_enabled = False
    tp = fp = fn = tn = 0
    ship_errors, leads = [], []
    baseline_hits = proposed_hits = true_total = baseline_flags = proposed_flags = 0
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
    }


if __name__ == "__main__":
    from app.ml import predict

    report = {"rules_only": run()}
    if predict.load_model("delay") is not None:
        report["rules_plus_delay_model"] = run(use_ml=True)
    print(json.dumps(report, indent=2))
