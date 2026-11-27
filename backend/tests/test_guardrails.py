from app.agent import guardrails

LOG = [{"tool": "calculate_shortage", "ok": True,
        "result": {"material_id": "MCU_AUTO", "gap": 150, "needed_by": "2026-12-02",
                   "options": [{"supplier_id": "SUP_A", "qty": 200}]}}]


def test_grounded_text_passes():
    text = {"reasoning": "O103 needs 200 of MCU_AUTO by 2026-12-02, gap 150."}
    assert guardrails.grounding_errors(text, LOG) == []


def test_invented_values_fail():
    errors = guardrails.grounding_errors({"reasoning": "Order 275 by 2026-12-09"}, LOG)
    assert len(errors) == 2


def test_draft_must_match_sized_option():
    assert guardrails.draft_grounding_errors(LOG, "MCU_AUTO", "SUP_A", 200, "2026-12-02") == []
    assert guardrails.draft_grounding_errors(LOG, "MCU_AUTO", "SUP_A", 250, "2026-12-02")
