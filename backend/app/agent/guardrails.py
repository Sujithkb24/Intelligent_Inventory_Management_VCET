import json
import re
from datetime import date

DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
NUMBER = re.compile(r"(?<![A-Za-z0-9_.])-?\d+(?:\.\d+)?(?![A-Za-z0-9_]|\.\d)")


def extract(text):
    dates = set(DATE.findall(text))
    stripped = DATE.sub(" ", re.sub(r"(?<=\d),(?=\d{3})", "", text))
    stripped = re.sub(r"\b[A-Za-z]+[A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)+\b", " ", stripped)
    return {abs(float(n)) for n in NUMBER.findall(stripped)}, dates


def known_values(log, extra_text=""):
    results = [entry["result"] for entry in log if entry["ok"]]
    return extract(json.dumps(results, default=str) + " " + extra_text)


def grounding_errors(payload, log, extra_text=""):
    numbers, dates = known_values(log, extra_text)
    checked = {k: v for k, v in payload.items() if k != "evidence_refs"}
    found_numbers, found_dates = extract(json.dumps(checked, default=str))
    errors = [f"ungrounded number {n:g}" for n in sorted(found_numbers)
              if not any(abs(n - k) < 0.01 for k in numbers)]
    return errors + [f"ungrounded date {d}" for d in sorted(found_dates - dates)]


def draft_grounding_errors(log, material_id, supplier_id, qty, needed_by):
    reports = [e["result"] for e in log if e["ok"] and e["tool"] == "calculate_shortage"
               and e["result"].get("material_id") == material_id]
    if not reports:
        return ["calculate_shortage must be called first"]
    report = reports[-1]
    errors = []
    if not any(o["supplier_id"] == supplier_id and abs(o["qty"] - qty) < 1e-6 for o in report["options"]):
        errors.append("qty does not match the sized option for this supplier")
    if needed_by != report["needed_by"]:
        errors.append("needed_by does not match the shortage report")
    return errors


def constraint_errors(state, material_id, supplier_id, qty, needed_by):
    offer = next((o for o in state.supplier_materials
                  if o["material_id"] == material_id and o["supplier_id"] == supplier_id), None)
    if not offer:
        return ["supplier does not supply this material"]
    errors = []
    if qty < offer.get("moq", 1):
        errors.append("qty is below MOQ")
    pack = max(offer.get("pack_size", 1), 1)
    if abs(qty / pack - round(qty / pack)) > 1e-9:
        errors.append("qty is not a multiple of pack size")
    try:
        date.fromisoformat(needed_by)
    except (TypeError, ValueError):
        errors.append("needed_by is not a valid date")
    return errors


def final_errors(final, draft, log):
    errors = grounding_errors(final, log)
    for key in ("material_id", "supplier_id", "qty", "needed_by"):
        if final.get(key) != draft[key]:
            errors.append(f"final {key} differs from the draft")
    return errors + grounding_errors({"reasoning": draft["reasoning"]}, log)
