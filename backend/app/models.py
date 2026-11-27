MATERIALS = "materials"
PRODUCTS = "products"
BOM = "bom"
ALTERNATES = "material_alternates"
SUPPLIERS = "suppliers"
SUPPLIER_MATERIALS = "supplier_materials"
EVENTS = "events"
LEDGER = "inventory_ledger"
BALANCES = "balances"
PURCHASE_ORDERS = "purchase_orders"
ORDERS = "customer_orders"
ALLOCATION_RUNS = "allocation_runs"
RISK_RUNS = "risk_runs"
RECOMMENDATIONS = "recommendations"
APPROVALS = "approvals"
ALERTS = "alerts"
AUDIT = "audit_log"
META = "meta"

ALL = [MATERIALS, PRODUCTS, BOM, ALTERNATES, SUPPLIERS, SUPPLIER_MATERIALS, EVENTS, LEDGER, BALANCES,
       PURCHASE_ORDERS, ORDERS, ALLOCATION_RUNS, RISK_RUNS, RECOMMENDATIONS, APPROVALS, ALERTS, AUDIT, META]


def pair_id(a, b):
    return f"{a}__{b}"
