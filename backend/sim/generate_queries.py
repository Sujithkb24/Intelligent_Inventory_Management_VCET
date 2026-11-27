import argparse
import json
from pathlib import Path

from app.config import ROOT
from app.db import get_store
from app.nlu.entity_resolver import load_config
from app.services import inventory


def build_queries(config, state):
    queries = []
    delay = config.get("delay_options", [1])[0]
    supplier_ids = list(state.suppliers)[:2]
    material_ids = list(state.materials)[:2]
    order_ids = list(state.orders)[:2]
    for intent in config.get("intents", []):
        for phrase in intent.get("phrases", [])[:3]:
            for synonym in config.get("synonyms", [])[:3]:
                queries.append(f"{phrase.capitalize()} {synonym.get('alias')}?")
    for phrase in config.get("temporal_phrases", []):
        if supplier_ids and material_ids:
            queries.append(f"What if {supplier_ids[0]} is {delay} days late on {material_ids[0]} {phrase}?")
    for phrase in config.get("scope_phrases", []):
        queries.append(f"Is the {phrase} short?")
    for phrase in config.get("reference_phrases", []):
        queries.append(f"Why is {phrase} late?")
    for phrase in config.get("ambiguous_intent_phrases", []):
        if material_ids:
            queries.append(f"{phrase.capitalize()} the {material_ids[0]} issue")
    for unit in config.get("pack_units", []):
        queries.append(f"Order a {unit} of {config.get('synonyms', [{}])[0].get('alias', material_ids[0] if material_ids else '')}")
    if order_ids:
        queries.append(f"Check {order_ids[0]}")
    return list(dict.fromkeys(q.strip() for q in queries if q.strip()))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(ROOT / "sim" / "data" / "ambiguous_queries.json"))
    args = parser.parse_args()
    config = load_config()
    state = inventory.load_state(get_store())
    query_set = build_queries(config, state)
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(query_set, indent=1))
    print(f"wrote {len(query_set)} ambiguous queries to {path}")


if __name__ == "__main__":
    main()
