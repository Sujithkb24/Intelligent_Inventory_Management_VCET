import json
import random
from datetime import date

import joblib
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.metrics import confusion_matrix, mean_absolute_error, precision_recall_fscore_support

from app.config import settings
from app.ml import features
from app.ml.predict import ARTIFACTS
from app.services.risk import evaluate
from sim.generate_data import actual_world, build_world, po_history


def delay_dataset(history):
    rows, targets, days, past = [], [], [], {}
    for po in sorted(history, key=lambda p: p["day"]):
        known = [d for arrived, d in past.get(po["supplier_id"], []) if arrived < po["day"]][-5:]
        recent = sum(known) / len(known) if known else 0
        rows.append(features.delay_features(po["reliability"], po["category"], po["lead_time_days"], po["qty"],
                                            po["typical_qty"], po["month"], recent, po["country"], po["moq"]))
        targets.append(po["actual_delay_days"])
        days.append(po["day"])
        past.setdefault(po["supplier_id"], []).append(
            (po["day"] + po["lead_time_days"] + po["actual_delay_days"], po["actual_delay_days"]))
    return rows, targets, days


def train_delay(seed=42):
    rows, targets, days = delay_dataset(po_history(random.Random(seed)))
    split = {name: [i for i, d in enumerate(days) if low <= d <= high]
             for name, low, high in (("train", 1, 60), ("validation", 61, 75), ("test", 76, 90))}
    model = GradientBoostingRegressor(random_state=seed, loss="absolute_error", n_estimators=150, max_depth=2)
    model.fit([rows[i] for i in split["train"]], [targets[i] for i in split["train"]])
    report = {}
    for name in ("validation", "test"):
        actual = [targets[i] for i in split[name]]
        report[name] = {"n": len(actual),
                        "mae_days": round(mean_absolute_error(actual, model.predict([rows[i] for i in split[name]])), 3),
                        "zero_delay_baseline_mae": round(mean_absolute_error(actual, [0] * len(actual)), 3)}
    report["train_n"] = len(split["train"])
    return model, report


def miss_dataset(seeds, today):
    rows, labels, rules = [], [], []
    for seed in seeds:
        state, truth_delays = build_world(seed, today)
        allocations, planned = evaluate(state, today, False)
        _, actual = evaluate(actual_world(state, truth_delays), today, False)
        outcome = {r["order_id"]: r["risk_level"] == "HIGH" for r in actual}
        for r in planned:
            rows.append(features.miss_row(state, state.orders[r["order_id"]], allocations, r, today))
            labels.append(int(outcome[r["order_id"]]))
            rules.append(int(r["risk_level"] == "HIGH"))
    return rows, labels, rules


def scores(actual, predicted):
    precision, recall, f1, _ = precision_recall_fscore_support(actual, predicted, average="binary", zero_division=0)
    return {"precision": round(float(precision), 3), "recall": round(float(recall), 3), "f1": round(float(f1), 3),
            "confusion_matrix": confusion_matrix(actual, predicted, labels=[0, 1]).tolist()}


def train_miss(today, seed=42):
    train_x, train_y, _ = miss_dataset(range(100, 112), today)
    test_x, test_y, test_rule = miss_dataset(range(200, 204), today)
    model = GradientBoostingClassifier(random_state=seed, n_estimators=100, max_depth=2)
    model.fit(train_x, train_y)
    report = {"train_n": len(train_y), "test_n": len(test_y),
              "test_positive_rate": round(sum(test_y) / len(test_y), 3),
              "model": scores(test_y, model.predict(test_x)), "rule_slack_below_zero": scores(test_y, test_rule)}
    return model, report


def main():
    ARTIFACTS.mkdir(exist_ok=True)
    delay_model, delay_report = train_delay()
    miss_model, miss_report = train_miss(settings.today() if settings.today_override else date.today())
    joblib.dump(delay_model, ARTIFACTS / "delay.joblib")
    joblib.dump(miss_model, ARTIFACTS / "miss.joblib")
    report = {"delay_regressor": delay_report, "miss_crd_classifier": miss_report}
    (ARTIFACTS / "metrics.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
