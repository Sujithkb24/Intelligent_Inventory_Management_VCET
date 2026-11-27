from datetime import datetime, timedelta, timezone

from app import models
from app.config import settings
from app.db import new_id, now_iso


FIELD_STATE = {
    "order_id": "last_order",
    "material_id": "last_material",
    "supplier_id": "last_supplier",
}


def new_session_id():
    return new_id("SESSION")


def default_state():
    return {"last_order": None, "last_material": None, "last_supplier": None,
            "pending_ambiguities": [], "resolved_slots": {}, "last_question": None}


def load(store, session_id, user):
    if not session_id:
        return None
    doc = store.get(models.DIALOGUE_SESSIONS, session_id)
    if not doc:
        return None
    if doc.get("user") and user and doc.get("user") != user:
        return None
    updated = doc.get("updated_at")
    if updated:
        try:
            parsed = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            ttl = timedelta(minutes=int(settings.nlu_session_ttl_minutes))
            if datetime.now(timezone.utc) - parsed > ttl:
                return None
        except ValueError:
            return None
    state = default_state()
    state.update(doc.get("state") or {})
    return doc


def save(store, session_id, user, state):
    doc = {"session_id": session_id, "user": user, "state": state, "updated_at": now_iso()}
    store.atomic(lambda tx: tx.set(models.DIALOGUE_SESSIONS, session_id, doc))
    return doc


def apply_answers(store, session_id, user, answers):
    doc = load(store, session_id, user)
    state = dict(doc.get("state") or default_state()) if doc else default_state()
    pending = list(state.get("pending_ambiguities", []))
    resolved = dict(state.get("resolved_slots", {}))
    applied = []
    for answer in answers or []:
        text = str(answer).strip()
        lowered = text.lower()
        match = None
        for question in pending:
            for index, option in enumerate(question.get("options", []), start=1):
                option_id = str(option.get("id", "")).lower()
                label = str(option.get("label", "")).lower()
                if lowered in (option_id, label, str(index)):
                    match = (question, option)
                    break
            if match:
                break
        if not match:
            continue
        question, option = match
        field = question.get("field")
        chosen_id = str(option.get("id", ""))
        if field == "write_confirmed":
            resolved["write_confirmed"] = chosen_id == "confirm" or lowered in ("yes", "y", "1")
        else:
            resolved[field] = chosen_id
            state_key = FIELD_STATE.get(field)
            if state_key:
                state[state_key] = chosen_id
        applied.append({"ambiguity_type": question.get("ambiguity_type"), "field": field,
                        "chosen_id": chosen_id, "user_answer": text})
        pending.remove(question)
    state["resolved_slots"] = resolved
    state["pending_ambiguities"] = pending
    if doc:
        doc = save(store, session_id, user, state)
    return state, applied, doc
