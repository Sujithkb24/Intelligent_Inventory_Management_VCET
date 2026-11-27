import hashlib
import json
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app import models
from app.agent import guardrails
from app.agent.policies import build_policy, parse_json
from app.agent.tools import Toolbox
from app.config import settings
from app.db import audit, now_iso
from app.services import alerts, inventory


class AgentState(TypedDict, total=False):
    messages: list
    tool_calls: int
    revisions: int
    final: Any
    errors: list
    outcome: dict


def pending_calls(message):
    return [b for b in message["content"] if b.get("type") == "tool_use"]


def build_graph(store, toolbox, policy, mode, question, actor):
    def agent_node(state):
        try:
            message = policy.next(state["messages"], toolbox.log)
        except Exception as exc:
            return {"errors": [f"LLM_ERROR: {type(exc).__name__}: {exc}"]}
        return {"messages": state["messages"] + [message]}

    def tools_node(state):
        count = state["tool_calls"]
        results = []
        for call in pending_calls(state["messages"][-1]):
            if count >= settings.max_tool_calls:
                result, ok = {"error": "tool call limit reached"}, False
            else:
                result, ok = toolbox.call(call["name"], call["input"])
            count += 1
            results.append({"type": "tool_result", "tool_use_id": call["id"], "is_error": not ok,
                            "content": json.dumps(result, default=str)})
        return {"messages": state["messages"] + [{"role": "user", "content": results}], "tool_calls": count}

    def validate_node(state):
        text = "".join(b.get("text", "") for b in state["messages"][-1]["content"] if b.get("type") == "text")
        final = parse_json(text)
        if final is None:
            errors = ["final answer is not valid JSON"]
        elif toolbox.draft:
            errors = guardrails.final_errors(final, toolbox.draft, toolbox.log)
        elif mode == "ask":
            errors = guardrails.grounding_errors(final, toolbox.log, question)
        else:
            errors = guardrails.grounding_errors(final, toolbox.log)
        if errors and state["revisions"] < 1:
            feedback = ("Your answer failed validation: " + "; ".join(errors) +
                        ". Return corrected JSON using only values from tool results.")
            return {"messages": state["messages"] + [{"role": "user", "content": feedback}],
                    "revisions": state["revisions"] + 1, "errors": [], "final": None}
        return {"final": final, "errors": errors}

    def approval_gate_node(state):
        rec = {**toolbox.draft, "created_at": now_iso(),
               "evidence": {"trace": json.loads(json.dumps(toolbox.log, default=str)),
                            "final": state["final"], "policy": policy.name}}
        store.set(models.RECOMMENDATIONS, rec["rec_id"], rec)
        audit(store, actor, "DRAFT_CREATED", rec["rec_id"], {"policy": policy.name})
        return {"outcome": {"status": "DRAFTED", "recommendation": rec}}

    def no_action_node(state):
        return {"outcome": {"status": "ANSWERED" if mode == "ask" else "NO_ACTION", "result": state["final"],
                            "policy": policy.name, "tool_trace": toolbox.log}}

    def reject_node(state):
        grounding = any("ungrounded" in e or "differs" in e for e in state["errors"])
        flag = "GROUNDING_FAILURE" if grounding else "AGENT_FAILURE"
        audit(store, actor, flag, question[:100], {"errors": state["errors"],
                                                  "trace": json.loads(json.dumps(toolbox.log, default=str))})
        return {"outcome": {"status": "FAILED", "flag": flag, "errors": state["errors"], "policy": policy.name}}

    def after_agent(state):
        if state.get("errors"):
            return "reject"
        if pending_calls(state["messages"][-1]):
            return "tools" if state["tool_calls"] < settings.max_tool_calls + 2 else "limit"
        return "validate"

    def after_validate(state):
        if state.get("errors"):
            return "reject"
        if state.get("final") is None:
            return "agent"
        return "approval_gate" if toolbox.draft else "no_action"

    def limit_node(state):
        return {"errors": ["tool call limit exceeded"]}

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tools_node)
    graph.add_node("validate", validate_node)
    graph.add_node("limit", limit_node)
    graph.add_node("approval_gate", approval_gate_node)
    graph.add_node("no_action", no_action_node)
    graph.add_node("reject", reject_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", after_agent, ["tools", "validate", "reject", "limit"])
    graph.add_edge("tools", "agent")
    graph.add_edge("limit", "reject")
    graph.add_conditional_edges("validate", after_validate, ["agent", "approval_gate", "no_action", "reject"])
    for terminal in ("approval_gate", "no_action", "reject"):
        graph.add_edge(terminal, END)
    return graph.compile()


def execute(store, mode, target, prompt, actor):
    toolbox = Toolbox(inventory.load_state(store), settings.today(), allow_draft=mode == "investigate")
    policy = build_policy(toolbox, mode, target)
    graph = build_graph(store, toolbox, policy, mode, prompt, actor)
    start = {"messages": [{"role": "user", "content": prompt}], "tool_calls": 0, "revisions": 0, "errors": []}
    outcome = graph.invoke(start, {"recursion_limit": 40})["outcome"]
    if outcome["status"] == "FAILED":
        ref = hashlib.sha256(target.encode()).hexdigest()[:16]
        alerts.raise_alert(store, "AGENT_FAILURE", "MEDIUM", "; ".join(outcome["errors"])[:300], ref)
    return outcome


def investigate(store, order_id, actor):
    order = store.get(models.ORDERS, order_id)
    if not order or order["status"] not in ("OPEN", "ALLOCATED"):
        return {"status": "NOT_FOUND", "message": "open order not found"}
    existing = [r for r in store.list(models.RECOMMENDATIONS, status="PENDING")
                if order_id in r["affected_orders"]]
    if existing:
        return {"status": "DRAFTED", "recommendation": existing[0]}
    prompt = f"Investigate order {order_id} and draft a purchase order if one is needed."
    return execute(store, "investigate", order_id, prompt, actor)


def ask(store, question, actor):
    return execute(store, "ask", question, question, actor)
