from app.config import settings
from app.nlu import normalizer


def intent_from(extraction, config):
    phrase = normalizer.normalize(extraction.intent_phrase)
    for spec in config.get("intents", []):
        for candidate in spec.get("phrases", []):
            needle = normalizer.normalize(candidate)
            if phrase == needle or (needle and needle in phrase):
                return {"name": spec["name"], "access": spec.get("access", "read"),
                        "confidence": 1.0, "phrase": phrase}
    for candidate in config.get("ambiguous_intent_phrases", []):
        if normalizer.normalize(candidate) == phrase:
            return {"name": "unknown", "access": "ask", "confidence": 0.0, "phrase": phrase}
    return {"name": "unknown", "access": "ask", "confidence": 0.0, "phrase": phrase}


def _option(candidate):
    if isinstance(candidate, str):
        return {"id": candidate, "label": candidate, "score": 0.0, "entity_type": None}
    return {
        "id": str(candidate.get("id", "")),
        "label": str(candidate.get("label") or candidate.get("id", "")),
        "score": float(candidate.get("score") or 0.0),
        "entity_type": candidate.get("entity_type"),
    }


def _options(candidates, closest=None, limit=4):
    result = []
    seen = set()
    for candidate in candidates or []:
        option = _option(candidate)
        if option["id"] and option["id"].lower() not in seen:
            result.append(option)
            seen.add(option["id"].lower())
    for entity_id in closest or []:
        if len(result) >= min(2, limit):
            break
        if entity_id.lower() not in seen:
            result.append({"id": entity_id, "label": entity_id, "score": 0.0, "entity_type": None})
            seen.add(entity_id.lower())
    return result[:limit]


def decide(ambiguities, intent, config, session_state=None):
    session_state = session_state or {}
    confidence = float(config.get("confidence", settings.nlu_confidence))
    margin = float(config.get("margin", settings.nlu_margin))
    chosen = dict(session_state.get("resolved_slots", {}))
    interpretations = []
    questions = []
    decisions = []
    closest_all = {}
    for ambiguity in ambiguities:
        closest_all[ambiguity.get("field")] = ambiguity.get("closest", [])
    for ambiguity in ambiguities:
        field = ambiguity.get("field")
        ambiguity_type = ambiguity.get("type", "entity")
        if field in chosen:
            decisions.append({"type": ambiguity_type, "decision": "AUTO", "chosen_id": chosen[field],
                              "candidates": ambiguity.get("candidates", [])})
            continue
        options = _options(ambiguity.get("candidates", []), ambiguity.get("closest", []))
        if not options:
            decisions.append({"type": ambiguity_type, "decision": "REFUSED", "chosen_id": None,
                              "candidates": []})
            interpretations.append(f"No match for {ambiguity.get('phrase', field)}.")
            continue
        scores = sorted((o["score"] for o in options), reverse=True)
        top = options[0]
        lead = scores[0] - (scores[1] if len(scores) > 1 else 0.0)
        auto = False
        if len(options) == 1 and top["score"] >= confidence:
            auto = True
            interpretations.append(f"Reading this as {top['label']}.")
        elif intent.get("access") == "read" and lead >= margin and top["score"] > 0:
            auto = True
            interpretations.append(f"Assuming {top['label']} for {field}.")
        if auto:
            chosen[field] = top["id"]
            decisions.append({"type": ambiguity_type, "decision": "AUTO", "chosen_id": top["id"],
                              "candidates": options})
            continue
        questions.append({
            "ambiguity_type": ambiguity_type,
            "field": field,
            "question": ambiguity.get("question") or f"Which value did you mean for {field}?",
            "options": options,
        })
        decisions.append({"type": ambiguity_type, "decision": "ASKED", "chosen_id": None, "candidates": options})
    write_intents = {spec["name"] for spec in config.get("intents", []) if spec.get("access") == "write"}
    if intent.get("name") in write_intents and not chosen.get("write_confirmed"):
        questions.insert(0, {
            "ambiguity_type": "write_confirm",
            "field": "write_confirmed",
            "question": "This can create or change procurement data. Confirm before continuing?",
            "options": [{"id": "confirm", "label": "Confirm", "score": 1.0, "entity_type": None},
                        {"id": "cancel", "label": "Cancel", "score": 0.0, "entity_type": None}],
        })
        decisions.append({"type": "write_confirm", "decision": "ASKED", "chosen_id": None, "candidates": []})
    max_questions = max(1, int(config.get("max_questions", settings.nlu_max_questions)))
    questions = questions[:max_questions]
    refused = any(d["decision"] == "REFUSED" for d in decisions)
    status = "REFUSED" if refused else ("CLARIFY" if questions else "READY")
    return {"status": status, "chosen": chosen, "questions": questions,
            "interpretations": interpretations, "decisions": decisions}
