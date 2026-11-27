import json

from app import models
from app.agent import runner
from app.config import settings
from app.db import new_id, now_iso
from app.nlu import clarifier, dialogue_state, entity_resolver, extractor, policy, temporal
from app.services import inventory


STATE_FIELDS = {
    "order_id": "last_order",
    "material_id": "last_material",
    "supplier_id": "last_supplier",
}
ENTITY_FIELDS = {
    "MATERIAL": "material_id",
    "PRODUCT": "product_id",
    "SUPPLIER": "supplier_id",
}


def _state_candidates(mapping, entity_type, names=None):
    names = names or {}
    return [{"id": entity_id, "label": names.get(entity_id, entity_id), "score": 0.0,
             "entity_type": entity_type} for entity_id in sorted(mapping)]


def _closest(question, state, config, candidates=None):
    phrase = " ".join([question] + [c.get("phrase", "") for c in (candidates or [])])
    return entity_resolver.closest_ids(phrase, state, config)


def _ambiguity(ambiguity_type, field, candidates, question, closest=None, phrase=""):
    return {"type": ambiguity_type, "field": field, "candidates": candidates,
            "question": question, "closest": closest or [], "phrase": phrase}


def _log(store, session_id, question, decisions, applied):
    for decision in decisions:
        doc_id = new_id("RES")
        store.set(models.RESOLUTION_LOG, doc_id, {
            "id": doc_id,
            "session_id": session_id,
            "raw_text": question,
            "ambiguity_type": decision.get("type"),
            "candidates": json.dumps(decision.get("candidates", []), default=str),
            "decision": decision.get("decision"),
            "chosen_id": decision.get("chosen_id"),
            "user_answer": next((a["user_answer"] for a in applied
                                 if a.get("ambiguity_type") == decision.get("type")), None),
            "ts": now_iso(),
        })


def _save_state(store, session_id, user, state, chosen, questions):
    state = dict(state)
    state["resolved_slots"] = chosen
    state["pending_ambiguities"] = clarifier.pending_questions(questions)
    for field, key in STATE_FIELDS.items():
        if chosen.get(field):
            state[key] = chosen[field]
    dialogue_state.save(store, session_id, user, state)


def _temporal_options(today, config):
    options = []
    for phrase in config.get("temporal_phrases", []):
        parsed = temporal.parse([phrase], today, config)
        value = parsed.get("as_of") or parsed.get("start_date")
        if value and all(o["id"] != value for o in options):
            options.append({"id": value, "label": phrase, "score": 0.0, "entity_type": None})
        if len(options) >= 4:
            break
    return options


def _delay_options(config):
    return [{"id": str(value), "label": f"{value} days", "score": 0.0, "entity_type": None}
            for value in config.get("delay_options", [])]


def _build_ambiguities(question, extraction, intent, candidates, direct, quantity_values,
                       quantity_ambiguities, temporal_values, state, config, chosen, session_state):
    ambiguities = []
    interpretations = []
    for field, ids in direct.items():
        if not ids:
            continue
        if len(ids) == 1:
            chosen[field] = ids[0]
            interpretations.append(f"Reading this as {ids[0]}.")
        else:
            closest = entity_resolver.closest_ids(question, state, config)
            ambiguities.append(_ambiguity("entity", field, [{"id": value, "label": value, "score": 1.0}
                                                            for value in ids[:4]],
                                          f"Which {field.replace('_', ' ')} did you mean?", closest, question))
    for entity_type, bucket in candidates.items():
        field = ENTITY_FIELDS[entity_type]
        if not bucket or field in chosen:
            continue
        closest = _closest(question, state, config, bucket)
        options = [{"id": c["entity_id"], "label": c.get("alias") or c["entity_id"],
                    "score": c["confidence"], "entity_type": entity_type} for c in bucket[:4]]
        ambiguities.append(_ambiguity("entity", field, options,
                                      f"Which {entity_type.lower()} did you mean?", closest, question))
    reference_text = " ".join(extraction.reference_phrases)
    if reference_text:
        field = "supplier_id" if "supplier" in reference_text else "order_id"
        if field not in chosen:
            last_key = STATE_FIELDS.get(field)
            last_value = session_state.get(last_key)
            if last_value:
                chosen[field] = last_value
                interpretations.append(f"Using the last {field.replace('_', ' ')} {last_value}.")
            else:
                mapping = state.suppliers if field == "supplier_id" else state.orders
                entity_type = "SUPPLIER" if field == "supplier_id" else "ORDER"
                options = _state_candidates(mapping, entity_type,
                                            {k: v.get("name", k) for k, v in state.suppliers.items()}
                                            if field == "supplier_id" else None)
                ambiguities.append(_ambiguity("reference", field, options[:4],
                                              f"Which {field.replace('_', ' ')} does this refer to?",
                                              [o["id"] for o in options[4:8]], reference_text))
    if intent.get("name") == "unknown":
        options = [{"id": spec["name"], "label": spec["name"], "score": 0.0, "entity_type": None}
                   for spec in config.get("intents", []) if spec.get("access") == "read"][:4]
        ambiguities.append(_ambiguity("intent", "intent_name", options,
                                      "What would you like to do?", [], extraction.intent_phrase))
    scope_text = " ".join(extraction.scope_phrases)
    if ("one order" in scope_text or "all orders" in scope_text) and "order_id" not in chosen:
        if not any(a["field"] == "order_id" for a in ambiguities):
            options = _state_candidates(state.orders, "ORDER")[:4]
            ambiguities.append(_ambiguity("scope", "order_id", options,
                                          "Should this apply to one order or all orders?", [], scope_text))
    if temporal_values.get("ambiguous"):
        ambiguities.append(_ambiguity("temporal", "as_of", _temporal_options(settings.today(), config),
                                      "Which time window did you mean?", [], temporal_values.get("phrases", "")))
    else:
        for field in ("start_date", "end_date", "as_of"):
            if temporal_values.get(field):
                chosen[field] = temporal_values[field]
        if temporal_values.get("start_date") and temporal_values.get("end_date"):
            interpretations.append(f"Reading the time window as {temporal_values['start_date']} to "
                                   f"{temporal_values['end_date']}.")
        elif temporal_values.get("as_of"):
            interpretations.append(f"Reading the date as {temporal_values['as_of']}.")
    for field, value in quantity_values.items():
        chosen[field] = value
        label = "quantity" if field == "qty" else field.replace("_", " ")
        interpretations.append(f"Reading the {label} as {value}.")
    ambiguities.extend(quantity_ambiguities)
    if intent.get("name") == "simulate":
        if not chosen.get("material_id") and not chosen.get("po_id") and not any(a["field"] == "material_id" for a in ambiguities):
            options = [{"id": c["entity_id"], "label": c.get("alias") or c["entity_id"],
                        "score": c["confidence"], "entity_type": c["entity_type"]}
                       for c in candidates.get("MATERIAL", [])[:4]]
            if not options:
                options = _state_candidates(state.materials, "MATERIAL",
                                            {k: v.get("name", k) for k, v in state.materials.items()})[:4]
            ambiguities.append(_ambiguity("missing_slot", "material_id", options,
                                          "Which material or purchase order should be simulated?",
                                          _closest(question, state, config), question))
        if chosen.get("delay_days") is None and not any(a["field"] == "delay_days" for a in ambiguities):
            ambiguities.append(_ambiguity("missing_slot", "delay_days", _delay_options(config),
                                          "How many days late should the supplier be?", [], question))
    if intent.get("name") == "investigate" and not chosen.get("order_id"):
        if not any(a["field"] == "order_id" for a in ambiguities):
            options = _state_candidates(state.orders, "ORDER")[:4]
            ambiguities.append(_ambiguity("missing_slot", "order_id", options,
                                          "Which order should I investigate?", [], question))
    if intent.get("name") == "draft_po" and not chosen.get("material_id"):
        if not any(a["field"] == "material_id" for a in ambiguities):
            options = _state_candidates(state.materials, "MATERIAL",
                                        {k: v.get("name", k) for k, v in state.materials.items()})[:4]
            ambiguities.append(_ambiguity("missing_slot", "material_id", options,
                                          "Which material should the draft cover?", [], question))
    return ambiguities, interpretations


def _normalize_outcome(outcome, session_id, interpretations):
    if outcome.get("status") == "FAILED":
        return {"status": "REFUSED", "session_id": session_id,
                "answer": "I could not safely answer: " + "; ".join(outcome.get("errors", [])),
                "questions": [], "interpretations": interpretations, "trace": [], "policy": outcome.get("policy")}
    if outcome.get("status") == "DRAFTED":
        recommendation = outcome.get("recommendation") or {}
        return {"status": "ANSWERED", "session_id": session_id,
                "answer": f"Created draft {recommendation.get('rec_id', '')} for human approval.",
                "questions": [], "interpretations": interpretations, "trace": [], "policy": None}
    result = outcome.get("result") or {}
    answer = result.get("answer") or result.get("problem") or json.dumps(result, default=str)
    return {"status": "ANSWERED", "session_id": session_id, "answer": str(answer),
            "questions": [], "interpretations": interpretations,
            "trace": outcome.get("tool_trace") or [], "policy": outcome.get("policy")}


def process(store, question, session_id=None, answers=None, user="unknown"):
    config = entity_resolver.load_config()
    state = inventory.load_state(store)
    alias_rows = entity_resolver.aliases(store, config)
    vocabulary = sorted({row.get("alias") for row in alias_rows if row.get("alias")})
    existing = store.get(models.DIALOGUE_SESSIONS, session_id) if session_id else None
    if existing and existing.get("user") and user and existing.get("user") != user:
        return {"status": "REFUSED", "session_id": new_id("SESSION"),
                "answer": "That clarification session belongs to another user.",
                "questions": [], "interpretations": [], "trace": []}
    doc = dialogue_state.load(store, session_id, user)
    session_id = session_id or dialogue_state.new_session_id()
    session_state = dict((doc or {}).get("state") or dialogue_state.default_state())
    applied = []
    if answers:
        session_state, applied, _ = dialogue_state.apply_answers(store, session_id, user, answers)
    chosen = dict(session_state.get("resolved_slots", {}))
    if answers and chosen.get("write_confirmed") is False:
        return {"status": "REFUSED", "session_id": session_id, "answer": "Cancelled.",
                "questions": [], "interpretations": [], "trace": []}
    extraction = extractor.extract(question, config, vocabulary)
    intent = policy.intent_from(extraction, config)
    if chosen.get("intent_name"):
        selected = next((spec for spec in config.get("intents", [])
                         if spec["name"] == chosen["intent_name"]), None)
        if selected:
            intent = {"name": selected["name"], "access": selected.get("access", "read"),
                      "confidence": 1.0, "phrase": extraction.intent_phrase}
    candidates = entity_resolver.resolve(extraction.entity_phrases, state, alias_rows, config)
    direct = entity_resolver.resolve_canonical_ids(question, state)
    quantity_values, quantity_ambiguities = entity_resolver.parse_quantity(
        extraction.quantity_phrases, state, candidates, config)
    temporal_values = temporal.parse(extraction.temporal_phrases, settings.today(), config)
    ambiguities, interpretations = _build_ambiguities(question, extraction, intent, candidates, direct,
                                                      quantity_values, quantity_ambiguities, temporal_values,
                                                      state, config, chosen, session_state)
    decision = policy.decide(ambiguities, intent, config, {**session_state, "resolved_slots": chosen})
    chosen = decision["chosen"]
    interpretations.extend(decision["interpretations"])
    _log(store, session_id, question, decision["decisions"], applied)
    if decision["status"] != "READY":
        _save_state(store, session_id, user, session_state, chosen, decision["questions"])
        return {"status": decision["status"], "session_id": session_id,
                "answer": clarifier.summary(interpretations, decision["questions"],
                                            decision["status"] == "REFUSED"),
                "questions": clarifier.as_api_questions(decision["questions"]),
                "interpretations": interpretations, "trace": []}
    _save_state(store, session_id, user, session_state, chosen, [])
    if intent.get("name") == "draft_po":
        if not chosen.get("order_id"):
            closest = entity_resolver.closest_ids(question, state, config)
            return {"status": "REFUSED", "session_id": session_id,
                    "answer": "Name an order for the draft. Closest valid IDs: " + ", ".join(closest),
                    "questions": [], "interpretations": interpretations, "trace": []}
        outcome = runner.investigate(store, chosen["order_id"], user)
    else:
        outcome = runner.ask(store, question, user, slots=chosen)
    return _normalize_outcome(outcome, session_id, interpretations)
