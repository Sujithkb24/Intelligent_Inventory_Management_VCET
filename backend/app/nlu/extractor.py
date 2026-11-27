import json
import re
from dataclasses import dataclass, field

from app.config import settings
from app.nlu import normalizer


@dataclass
class Extraction:
    normalized: str
    intent_phrase: str = ""
    entity_phrases: list[str] = field(default_factory=list)
    temporal_phrases: list[str] = field(default_factory=list)
    quantity_phrases: list[str] = field(default_factory=list)
    reference_phrases: list[str] = field(default_factory=list)
    scope_phrases: list[str] = field(default_factory=list)

    def as_dict(self):
        return {
            "normalized": self.normalized,
            "intent_phrase": self.intent_phrase,
            "entity_phrases": self.entity_phrases,
            "temporal_phrases": self.temporal_phrases,
            "quantity_phrases": self.quantity_phrases,
            "reference_phrases": self.reference_phrases,
            "scope_phrases": self.scope_phrases,
        }


def _as_list(value):
    if isinstance(value, str):
        return [value] if value.strip() else []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return []


def _matches(normalized, phrases):
    found = []
    for phrase in sorted(phrases, key=len, reverse=True):
        needle = normalizer.normalize(phrase)
        if len(needle) >= 2 and re.search(rf"(?<!\w){re.escape(needle)}(?!\w)", normalized):
            found.append(needle)
    return found


def _intent(normalized, config):
    best_phrase = ""
    best_name = ""
    best_access = ""
    for spec in config.get("intents", []):
        for phrase in spec.get("phrases", []):
            needle = normalizer.normalize(phrase)
            if needle in normalized and len(needle) > len(best_phrase):
                best_phrase, best_name, best_access = needle, spec["name"], spec.get("access", "read")
    if best_phrase:
        return best_phrase, best_name, best_access
    for phrase in config.get("ambiguous_intent_phrases", []):
        needle = normalizer.normalize(phrase)
        if needle in normalized and len(needle) > len(best_phrase):
            best_phrase, best_name, best_access = needle, "unknown", "ask"
    return best_phrase, best_name, best_access


def _fallback(question, config, vocabulary):
    normalized = normalizer.normalize(question)
    intent_phrase, _, _ = _intent(normalized, config)
    temporal = config.get("temporal_phrases", []) + config.get("delay_units", [])
    quantity_units = list(config.get("unit_multipliers", {})) + config.get("pack_units", []) + config.get("delay_units", [])
    quantity = []
    for number, unit in re.findall(r"(\d+(?:\.\d+)?)\s*([a-z]+)?", normalized):
        raw = f"{number} {unit or ''}".strip()
        if not unit or unit in quantity_units:
            quantity.append(raw)
    return Extraction(
        normalized=normalized,
        intent_phrase=intent_phrase,
        entity_phrases=_matches(normalized, vocabulary),
        temporal_phrases=_matches(normalized, temporal),
        quantity_phrases=quantity,
        reference_phrases=_matches(normalized, config.get("reference_phrases", [])),
        scope_phrases=_matches(normalized, config.get("scope_phrases", [])),
    )


def _use_llm():
    use_claude = settings.llm_provider == "claude" or (settings.llm_provider == "auto" and settings.anthropic_key)
    return bool(use_claude and settings.anthropic_key)


def _llm_extract(question, config, vocabulary):
    from anthropic import Anthropic

    client = Anthropic(api_key=settings.anthropic_key, timeout=60)
    system = (
        "Extract only surface phrases from the planner question. Return JSON with keys intent_phrase, "
        "entity_phrases, temporal_phrases, quantity_phrases, reference_phrases, scope_phrases. "
        "Values must be phrases copied from the question. Do not resolve, translate, normalize, "
        "invent, or return canonical IDs. Use empty lists when nothing is present."
    )
    payload = json.dumps({"question": question, "known_phrases": list(vocabulary)[:300], "units": config.get("unit_multipliers", {})})
    response = client.messages.create(
        model=settings.model,
        max_tokens=800,
        system=system,
        messages=[{"role": "user", "content": payload}],
    )
    text = "".join(getattr(block, "text", "") for block in response.content)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("extractor did not return JSON")
    parsed = json.loads(match.group(0))
    normalized = normalizer.normalize(question)
    return Extraction(
        normalized=normalized,
        intent_phrase=str(parsed.get("intent_phrase") or "").strip(),
        entity_phrases=_as_list(parsed.get("entity_phrases")),
        temporal_phrases=_as_list(parsed.get("temporal_phrases")),
        quantity_phrases=_as_list(parsed.get("quantity_phrases")),
        reference_phrases=_as_list(parsed.get("reference_phrases")),
        scope_phrases=_as_list(parsed.get("scope_phrases")),
    )


def extract(question, config, vocabulary=None):
    vocabulary = sorted({normalizer.normalize(v) for v in (vocabulary or []) if normalizer.normalize(v)})
    if _use_llm():
        try:
            return _llm_extract(question, config, vocabulary)
        except Exception:
            pass
    return _fallback(question, config, vocabulary)
