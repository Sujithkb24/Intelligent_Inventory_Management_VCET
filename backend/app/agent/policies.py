import json
import re
import uuid

from app.agent.prompts import ASK_PROMPT, SYSTEM_PROMPT
from app.agent.tools import SPECS
from app.config import settings


def tool_use(name, args):
    return {"type": "tool_use", "id": "call_" + uuid.uuid4().hex[:12], "name": name, "input": args}


def parse_json(text):
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


class ClaudePolicy:
    name = "claude"

    def __init__(self, toolbox, mode):
        from anthropic import Anthropic

        self.client = Anthropic(api_key=settings.anthropic_key, timeout=60)
        self.system = SYSTEM_PROMPT if mode == "investigate" else ASK_PROMPT
        self.specs = [s for s in SPECS if s["name"] in toolbox.names()]

    def next(self, messages, log):
        response = self.client.messages.create(model=settings.model, max_tokens=4000, system=self.system,
                                               tools=self.specs, messages=messages)
        content = [block.model_dump(exclude_none=True) for block in response.content]
        return {"role": "assistant", "content": content}


class RulePolicy:
    name = "rules"

    def __init__(self, toolbox, mode, target):
        self.toolbox = toolbox
        self.mode = mode
        self.target = target

    def next(self, messages, log):
        step = self.investigate(log) if self.mode == "investigate" else self.ask(log)
        if "call" in step:
            return {"role": "assistant", "content": [tool_use(*step["call"])]}
        return {"role": "assistant", "content": [{"type": "text", "text": json.dumps(step["final"])}]}

    def investigate(self, log):
        done = {}
        for entry in log:
            done.setdefault(entry["tool"], []).append(entry)
        if log and not log[-1]["ok"]:
            return self.stop(f"Tool {log[-1]['tool']} failed: {log[-1]['result']['error']}")
        if "get_order_status" not in done:
            return {"call": ("get_order_status", {"order_id": self.target})}
        order = done["get_order_status"][0]["result"]
        material = order["bottleneck_material"]
        if not material or order["risk_level"] == "LOW":
            return self.stop("The order has no material bottleneck that needs a purchase.")
        for name in ("calculate_shortage", "get_inventory", "get_supplier_details"):
            if name not in done:
                return {"call": (name, {"material_id": material})}
        report = done["calculate_shortage"][0]["result"]
        options = report["options"]
        if not report["order_gap"] or not options:
            return self.stop(f"No purchasable shortage found for {material}.")
        simulated = len(done.get("simulate_procurement", []))
        if simulated < min(len(options), 3):
            option = options[simulated]
            return {"call": ("simulate_procurement", {"material_id": material,
                                                      "supplier_id": option["supplier_id"], "qty": option["qty"]})}
        best = options[0]
        alternates = done["get_supplier_details"][0]["result"]["alternates"]
        risks = []
        if best["single_source"]:
            risks.append(f"{best['supplier_id']} is a single source for {material}.")
        if best["reliability"] < settings.reliability_floor:
            risks.append(f"{best['supplier_id']} reliability is {best['reliability']}.")
        if not best["meets_crd"]:
            risks.append(f"Estimated arrival {best['est_arrival']} is after the needed date.")
        if alternates:
            risks.append("Alternates available: " + ", ".join(alternates))
        reasoning = (f"{material} has an uncovered quantity of {report['order_gap']:g}. "
                     f"{best['supplier_id']} is ranked first; quantity {best['qty']:g} includes a "
                     f"{report['buffer_percent']:g}% buffer, MOQ and pack rounding. " + " ".join(risks))
        if "create_po_draft" not in done:
            return {"call": ("create_po_draft", {"material_id": material, "supplier_id": best["supplier_id"],
                                                 "qty": best["qty"], "needed_by": report["needed_by"],
                                                 "reasoning": reasoning})}
        return {"final": {"problem": f"{self.target} is at risk because of {material}.", "material_id": material,
                          "supplier_id": best["supplier_id"], "qty": best["qty"], "needed_by": report["needed_by"],
                          "affected_orders": report["affected_orders"], "reasoning": reasoning, "risks": risks,
                          "evidence_refs": ["calculate_shortage", "get_supplier_details"]}}

    def stop(self, message):
        return {"final": {"problem": message, "qty": None}}

    def ask(self, log):
        text = self.target
        state = self.toolbox.state
        order = next((o for o in state.orders if re.search(rf"\b{re.escape(o)}\b", text, re.I)), None)
        material = next((m for m in state.materials if re.search(rf"\b{re.escape(m)}\b", text, re.I)), None)
        supplier = next((s for s, row in state.suppliers.items()
                         if s.lower() in text.lower() or row.get("name", s).lower() in text.lower()), None)
        days = re.search(r"(\d+)\s*days?", text, re.I)
        if not log:
            if days and (supplier or material):
                delay = {"delay_days": int(days.group(1)), "supplier_id": supplier, "material_id": material}
                return {"call": ("simulate_what_if", {"supplier_delays": [delay]})}
            if order:
                return {"call": ("get_order_status", {"order_id": order})}
            if material:
                return {"call": ("calculate_shortage", {"material_id": material})}
            return {"final": {"answer": "Name an order, a material, or a supplier delay in days. "
                                        "Set ANTHROPIC_API_KEY for free-form questions."}}
        entry = log[-1]
        result = entry["result"]
        if not entry["ok"]:
            answer = f"I could not answer: {result['error']}"
        elif entry["tool"] == "simulate_what_if":
            answer = (f"Newly HIGH: {', '.join(result['newly_high']) or 'none'}. "
                      f"Orders with changed slack or risk: "
                      f"{', '.join(c['order_id'] for c in result['changes']) or 'none'}.")
        elif entry["tool"] == "get_order_status":
            answer = (f"{result['order_id']} is {result['risk_level']} risk. CRD {result['crd']}, projected ship "
                      f"{result['projected_ship_date'] or 'not coverable'}, bottleneck "
                      f"{result['bottleneck_material'] or 'none'}.")
        else:
            answer = (f"{result['material_id']} uncovered quantity is {result['order_gap']:g}; affected orders: "
                      f"{', '.join(result['affected_orders']) or 'none'}.")
        return {"final": {"answer": answer, "evidence_refs": [entry["tool"]]}}


def build_policy(toolbox, mode, target):
    use_claude = settings.llm_provider == "claude" or (settings.llm_provider == "auto" and settings.anthropic_key)
    return ClaudePolicy(toolbox, mode) if use_claude else RulePolicy(toolbox, mode, target)
