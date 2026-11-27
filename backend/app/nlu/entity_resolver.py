import difflib
import json
import re
from pathlib import Path

from app import models
from app.config import ROOT, settings
from app.nlu import normalizer


SOURCE_TYPES = [
    (models.MATERIALS, "MATERIAL", "material_id"),
    (models.PRODUCTS, "PRODUCT", "product_id"),
    (models.SUPPLIERS, "SUPPLIER", "supplier_id"),
]


def load_config():
    path = Path(settings.nlu_config_file)
    if not path.is_absolute():
        path = ROOT / path
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def seed_aliases(store, config=None):
    config = config or load_config()
    docs = {}
    for collection, entity_type, key in SOURCE_TYPES:
        for row in store.list(collection):
            entity_id = row.get(key)
            if not entity_id:
                continue
            values = {entity_id: 1.0}
            if row.get("name"):
                values[row["name"]] = 0.95
            for alias, weight in values.items():
                normalized = normalizer.normalize(alias)
                if normalized:
                    doc_id = f"{entity_type}|{normalized}|{entity_id}"
                    docs[doc_id] = {"alias": normalized, "entity_type": entity_type,
                                    "entity_id": entity_id, "weight": weight}
    for row in config.get("synonyms", []):
        normalized = normalizer.normalize(row.get("alias", ""))
        entity_id = row.get("entity_id")
        entity_type = row.get("entity_type")
        if normalized and entity_id and entity_type:
            doc_id = f"{entity_type}|{normalized}|{entity_id}"
            docs[doc_id] = {"alias": normalized, "entity_type": entity_type,
                            "entity_id": entity_id, "weight": float(row.get("weight", 0.9))}
    store.set_many(models.ALIASES, docs)
    return len(docs)


def aliases(store, config=None):
    rows = store.list(models.ALIASES)
    if not rows:
        seed_aliases(store, config)
        rows = store.list(models.ALIASES)
    return rows


def canonical_map(state, entity_type):
    return {
        "MATERIAL": state.materials,
        "PRODUCT": state.products,
        "SUPPLIER": state.suppliers,
    }.get(entity_type, {})


def _phrase_text(phrase):
    return phrase.get("text", "") if isinstance(phrase, dict) else str(phrase)


def resolve(phrases, state, alias_rows, config):
    candidates = {entity_type: [] for _, entity_type, _ in SOURCE_TYPES}
    stopwords = {normalizer.normalize(w) for w in config.get("stopwords", [])}
    cutoff = float(config.get("fuzzy_cutoff", 0.45))
    for raw_phrase in phrases or []:
        phrase = normalizer.normalize(_phrase_text(raw_phrase))
        if not phrase or phrase in stopwords or re.fullmatch(r"\d+(?:\.\d+)?", phrase):
            continue
        for row in alias_rows:
            alias = normalizer.normalize(row.get("alias", ""))
            entity_type = row.get("entity_type")
            entity_id = row.get("entity_id")
            if not alias or entity_id not in canonical_map(state, entity_type):
                continue
            weight = float(row.get("weight", 1.0))
            if phrase == alias:
                score = weight
            elif len(alias) >= 3 and alias in phrase:
                score = weight * 0.85
            elif len(phrase) >= 3 and phrase in alias:
                score = weight * 0.80
            else:
                score = difflib.SequenceMatcher(None, phrase, alias).ratio() * weight * 0.80
            if score < cutoff:
                continue
            key = (entity_type, entity_id)
            bucket = candidates.setdefault(entity_type, [])
            existing = next((c for c in bucket if (c["entity_type"], c["entity_id"]) == key), None)
            candidate = {"entity_type": entity_type, "entity_id": entity_id, "alias": alias,
                         "phrase": phrase, "confidence": round(score, 4)}
            if existing is None:
                bucket.append(candidate)
            elif score > existing["confidence"]:
                existing.update(candidate)
    for bucket in candidates.values():
        bucket.sort(key=lambda c: c["confidence"], reverse=True)
    return candidates


def resolve_canonical_ids(question, state):
    normalized = normalizer.normalize(question)
    sources = {
        "order_id": list(state.orders),
        "material_id": list(state.materials),
        "product_id": list(state.products),
        "supplier_id": list(state.suppliers),
        "po_id": list(state.purchase_orders),
    }
    found = {}
    for field, ids in sources.items():
        found[field] = [entity_id for entity_id in sorted(ids, key=len, reverse=True)
                        if re.search(rf"(?<!\w){re.escape(normalizer.normalize(entity_id))}(?!\w)", normalized)]
    return found


def closest_ids(phrase, state, config, limit=4):
    normalized = normalizer.normalize(phrase)
    known = {}
    for collection in (state.materials, state.products, state.suppliers, state.orders, state.purchase_orders):
        for entity_id, row in collection.items():
            known[entity_id] = entity_id
            if isinstance(row, dict) and row.get("name"):
                known[normalizer.normalize(row["name"])] = entity_id
    matches = difflib.get_close_matches(normalized, list(known), n=limit,
                                        cutoff=float(config.get("fuzzy_cutoff", 0.45)))
    result = []
    for match in matches:
        entity_id = known[match]
        if entity_id not in result:
            result.append(entity_id)
    return result


def parse_quantity(phrases, state, candidates, config):
    values = {}
    ambiguities = []
    delay_units = {normalizer.normalize(u) for u in config.get("delay_units", [])}
    multipliers = {normalizer.normalize(k): float(v) for k, v in config.get("unit_multipliers", {}).items()}
    pack_units = {normalizer.normalize(u) for u in config.get("pack_units", [])}
    material_id = None
    material_candidates = candidates.get("MATERIAL", [])
    if material_candidates and material_candidates[0]["confidence"] >= 0.9:
        material_id = material_candidates[0]["entity_id"]
    for phrase in phrases or []:
        text = normalizer.normalize(_phrase_text(phrase))
        match = re.search(r"(\d+(?:\.\d+)?)\s*([a-z]+)?", text)
        if not match:
            continue
        quantity = float(match.group(1))
        unit = normalizer.normalize(match.group(2) or "")
        if unit in delay_units:
            factor = 7 if unit.startswith("week") else 1
            values["delay_days"] = int(round(quantity * factor))
        elif unit in multipliers:
            values["qty"] = int(round(quantity * multipliers[unit]))
        elif unit in pack_units:
            if material_id:
                offer = next((o for o in state.supplier_materials if o["material_id"] == material_id), None)
                pack_size = max((offer or {}).get("pack_size", 1), 1)
                values["qty"] = int(round(quantity * pack_size))
            else:
                ambiguities.append({"type": "quantity_pack_size", "field": "material_id", "phrase": text,
                                    "candidates": [{"id": c["entity_id"], "label": c["entity_id"],
                                                    "score": c["confidence"], "entity_type": c["entity_type"]}
                                                   for c in material_candidates[:4]]})
        elif not unit:
            values["qty"] = int(round(quantity))
    return values, ambiguities
