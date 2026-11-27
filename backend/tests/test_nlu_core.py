from app import models
from app.nlu import entity_resolver, extractor, normalizer, policy, temporal
from app.services import inventory
from tests.conftest import TODAY


def test_normalizer_preserves_canonical_ids_and_numbers():
    assert normalizer.normalize("Why is O102 at risk with 5k MCU_AUTO?") == \
        "why is o102 at risk with 5k mcu_auto"


def test_aliases_are_seeded_from_live_master_data(store):
    entity_resolver.aliases(store)
    rows = store.list(models.ALIASES)
    assert any(r["alias"] == "mcu" and r["entity_id"] == "MCU_AUTO" for r in rows)
    assert any(r["alias"] == "supplier a" and r["entity_id"] == "SUP_A" for r in rows)


def test_mcu_is_ambiguous_against_live_catalog(store):
    config = entity_resolver.load_config()
    state = inventory.load_state(store)
    candidates = entity_resolver.resolve(["MCU"], state, entity_resolver.aliases(store, config), config)
    ids = {c["entity_id"] for c in candidates["MATERIAL"]}
    assert {"MCU_AUTO", "MCU_AUTO_B"}.issubset(ids)


def test_direct_canonical_id_has_full_confidence(store):
    state = inventory.load_state(store)
    direct = entity_resolver.resolve_canonical_ids("Why is O102 at risk?", state)
    assert direct["order_id"] == ["O102"]


def test_temporal_next_week_is_anchored_to_today():
    config = entity_resolver.load_config()
    parsed = temporal.parse(["next week"], TODAY, config)
    start = parsed["start_date"]
    end = parsed["end_date"]
    assert start and end
    assert (TODAY.weekday() + 1) <= 7
    assert start <= end


def test_quantity_units_use_config_and_live_pack_size(store):
    config = entity_resolver.load_config()
    state = inventory.load_state(store)
    candidates = entity_resolver.resolve(["cells"], state, entity_resolver.aliases(store, config), config)
    values, ambiguities = entity_resolver.parse_quantity(["5k"], state, candidates, config)
    assert values["qty"] == 5000
    assert not ambiguities
    values, ambiguities = entity_resolver.parse_quantity(["1 tray"], state, candidates, config)
    assert values["qty"] == 500
    assert not ambiguities


def test_write_intent_always_requires_confirmation():
    config = entity_resolver.load_config()
    extraction = extractor.extract("Create a PO for MCU_AUTO", config, ["mcu_auto"])
    intent = policy.intent_from(extraction, config)
    decision = policy.decide([], intent, config, {})
    assert intent["name"] == "draft_po"
    assert decision["status"] == "CLARIFY"
    assert decision["questions"][0]["field"] == "write_confirmed"


def test_read_intent_auto_resolves_large_margin():
    config = entity_resolver.load_config()
    decision = policy.decide([{
        "type": "entity", "field": "material_id",
        "candidates": [{"id": "PACK_3K", "label": "PACK_3K", "score": 0.95},
                       {"id": "CELL_21700", "label": "CELL_21700", "score": 0.30}],
        "question": "Which material?", "closest": [],
    }], {"name": "investigate", "access": "read"}, config, {})
    assert decision["status"] == "READY"
    assert decision["chosen"]["material_id"] == "PACK_3K"
