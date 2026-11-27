from sim.evaluate_agent import CASES, evaluate_case


def test_agent_evaluation_checks_grounding_and_answer(monkeypatch):
    outcome = {
        "status": "ANSWERED",
        "result": {"answer": "O103 is HIGH risk due to MCU_AUTO."},
        "tool_trace": [{
            "tool": "get_order_status", "ok": True,
            "result": {"risk_level": "HIGH", "bottleneck_material": "MCU_AUTO"},
        }],
        "llm_usage": {"requests": 1, "input_tokens": 20, "output_tokens": 10},
    }
    monkeypatch.setattr("sim.evaluate_agent.runner.ask", lambda *_args: outcome)

    report = evaluate_case(None, CASES[0])

    assert report["passed"]
    assert report["ground_truth_checks"] == {"risk_level": True, "bottleneck_material": True}
    assert report["answer_checks"] == {"HIGH": True, "MCU_AUTO": True}
