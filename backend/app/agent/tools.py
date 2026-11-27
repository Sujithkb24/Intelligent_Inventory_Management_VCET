from app.config import settings
from app.db import new_id
from app.ml import predict
from app.schemas import SimulationIn
from app.services import inventory, procurement, risk, simulation


class Toolbox:
    def __init__(self, state, today, allow_draft):
        self.state = state
        self.today = today
        self.allow_draft = allow_draft
        self.log = []
        self.draft = None
        self.allocations, self.risks = risk.evaluate(state, today, settings.ml_enabled)

    def get_inventory(self, material_id):
        self.need_material(material_id)
        return {**inventory.position(self.state, material_id, self.allocations, self.today, settings.ml_enabled),
                "incoming_pos": inventory.incoming_pos(self.state, material_id, self.today, settings.ml_enabled)}

    def get_order_status(self, order_id):
        order = self.state.orders.get(order_id)
        if not order:
            raise ValueError(f"unknown or closed order {order_id}")
        status = next(r for r in self.risks if r["order_id"] == order_id)
        return {**status, "product_id": order["product_id"], "qty": order["qty"],
                "allocations": [a for a in self.allocations if a["order_id"] == order_id]}

    def get_supplier_details(self, material_id):
        self.need_material(material_id)
        rows = []
        for offer in self.state.supplier_materials:
            if offer["material_id"] == material_id:
                supplier = self.state.suppliers[offer["supplier_id"]]
                rows.append({**offer, "name": supplier.get("name"),
                             "reliability": predict.supplier_reliability(self.state, offer["supplier_id"],
                                                                         material_id, today=self.today),
                             "single_source": bool(supplier.get("single_source"))})
        return {"material_id": material_id, "suppliers": rows,
                "alternates": self.state.alternates.get(material_id, [])}

    def calculate_shortage(self, material_id):
        self.need_material(material_id)
        return procurement.shortage_report(self.state, material_id, self.today)

    def simulate_procurement(self, material_id, supplier_id, qty):
        return procurement.simulate_procurement(self.state, material_id, supplier_id, qty, self.today)

    def simulate_what_if(self, supplier_delays=None, demand_changes=None, extra_receipts=None):
        scenario = SimulationIn(supplier_delays=supplier_delays or [], demand_changes=demand_changes or [],
                                extra_receipts=extra_receipts or [])
        result = simulation.simulate(self.state, scenario, self.today)
        return {"newly_high": result["newly_high"], "rescued": result["rescued"], "changes": result["changes"]}

    def create_po_draft(self, material_id, supplier_id, qty, needed_by, reasoning, evidence=None):
        from app.agent import guardrails

        if not self.allow_draft:
            raise ValueError("drafting is not allowed here")
        if self.draft:
            raise ValueError("a draft already exists for this run")
        errors = guardrails.constraint_errors(self.state, material_id, supplier_id, qty, needed_by)
        errors += guardrails.draft_grounding_errors(self.log, material_id, supplier_id, qty, needed_by)
        if errors:
            raise ValueError("; ".join(errors))
        offer = procurement.find_offer(self.state, material_id, supplier_id)
        report = procurement.shortage_report(self.state, material_id, self.today)
        self.draft = {"rec_id": new_id("REC"), "material_id": material_id, "supplier_id": supplier_id,
                      "qty": qty, "needed_by": needed_by, "est_cost": round(qty * offer["unit_price"], 2),
                      "affected_orders": report["affected_orders"], "reasoning": reasoning, "status": "PENDING"}
        return {"rec_id": self.draft["rec_id"], "status": "PENDING", "est_cost": self.draft["est_cost"]}

    def need_material(self, material_id):
        if material_id not in self.state.materials:
            raise ValueError(f"unknown material {material_id}")

    def names(self):
        shared = ["get_inventory", "get_order_status", "get_supplier_details", "calculate_shortage",
                  "simulate_procurement"]
        return shared + (["create_po_draft"] if self.allow_draft else ["simulate_what_if"])

    def call(self, name, args):
        try:
            if name not in self.names():
                raise ValueError(f"tool {name} is not available")
            result, ok = getattr(self, name)(**args), True
        except Exception as exc:
            result, ok = {"error": f"{type(exc).__name__}: {exc}"}, False
        self.log.append({"tool": name, "args": args, "ok": ok, "result": result})
        return result, ok


def spec(name, description, properties, required):
    return {"name": name, "description": description,
            "input_schema": {"type": "object", "properties": properties, "required": required}}


TEXT = {"type": "string"}
NUMBER = {"type": "number"}
LIST = {"type": "array", "items": {"type": "object"}}

SPECS = [
    spec("get_inventory", "On hand, incoming POs, allocated and net availability", {"material_id": TEXT},
         ["material_id"]),
    spec("get_order_status", "Order quantity, CRD, projected ship, slack, bottleneck, allocations",
         {"order_id": TEXT}, ["order_id"]),
    spec("get_supplier_details", "Suppliers, lead time, price, MOQ, pack size, reliability, alternates",
         {"material_id": TEXT}, ["material_id"]),
    spec("calculate_shortage", "Gap, needed_by, affected orders and ranked pre-sized supplier options",
         {"material_id": TEXT}, ["material_id"]),
    spec("simulate_procurement", "Effect of a purchase on order risk",
         {"material_id": TEXT, "supplier_id": TEXT, "qty": NUMBER}, ["material_id", "supplier_id", "qty"]),
    spec("create_po_draft", "Create a PENDING purchase order draft for human approval",
         {"material_id": TEXT, "supplier_id": TEXT, "qty": NUMBER, "needed_by": TEXT, "reasoning": TEXT,
          "evidence": {"type": "object"}},
         ["material_id", "supplier_id", "qty", "needed_by", "reasoning"]),
    spec("simulate_what_if", "Before and after risk for delays, demand changes or extra receipts. "
         "supplier_delays items: po_id or supplier_id and material_id, plus delay_days. "
         "demand_changes items: order_id, new_qty. extra_receipts items: material_id, qty, date",
         {"supplier_delays": LIST, "demand_changes": LIST, "extra_receipts": LIST}, []),
]
