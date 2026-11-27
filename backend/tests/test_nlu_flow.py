from app import models
from app.nlu import detector
from app.services import inventory


def test_ambiguous_mcu_asks_before_any_agent_service_runs(store):
    result = detector.process(store, "What if SUP_A is 5 days late on MCU next week?", user="tester")
    assert result["status"] == "CLARIFY"
    assert result["trace"] == []
    assert len(result["questions"]) <= 2
    material = next(q for q in result["questions"] if q["field"] == "material_id")
    ids = {option["id"] for option in material["options"]}
    assert {"MCU_AUTO", "MCU_AUTO_B"}.issubset(ids)
    assert all(2 <= len(q["options"]) <= 4 for q in result["questions"])
    assert store.list(models.RESOLUTION_LOG)


def test_canonical_order_is_answered_with_real_tool_trace(store):
    result = detector.process(store, "Why is O102 at risk?", user="tester")
    assert result["status"] == "ANSWERED"
    assert any(entry["tool"] == "get_order_status" for entry in result["trace"])
    assert "O102" in result["answer"]


def test_clarification_answer_resolves_from_dialogue_state(store):
    first = detector.process(store, "What if SUP_A is 5 days late on MCU?", user="tester")
    assert first["status"] == "CLARIFY"
    question = next(q for q in first["questions"] if q["field"] == "material_id")
    second = detector.process(store, "What if SUP_A is 5 days late on MCU?", first["session_id"],
                              ["MCU_AUTO"], "tester")
    assert second["status"] == "ANSWERED"
    assert any(entry["tool"] == "simulate_what_if" for entry in second["trace"])
    assert question["field"] == "material_id"


def test_write_intent_drafts_only_after_confirmation(store):
    first = detector.process(store, "Draft a PO for MCU_AUTO and O103", user="tester")
    assert first["status"] == "CLARIFY"
    assert [q["field"] for q in first["questions"]] == ["write_confirmed"]
    second = detector.process(store, "Draft a PO for MCU_AUTO and O103", first["session_id"],
                              ["confirm"], "tester")
    assert second["status"] == "ANSWERED"
    drafts = store.list(models.RECOMMENDATIONS, status="PENDING")
    assert drafts and drafts[0]["rec_id"] in second["answer"]
    assert inventory.load_state(store).orders


def test_session_isolation_refuses_other_user(store):
    first = detector.process(store, "What if SUP_A is 5 days late on MCU?", user="alice")
    second = detector.process(store, "What if SUP_A is 5 days late on MCU?", first["session_id"],
                              user="bob")
    assert second["status"] == "REFUSED"
