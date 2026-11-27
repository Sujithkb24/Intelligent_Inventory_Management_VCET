def explode(state, parent_id, qty, acc=None, path=()):
    acc = {} if acc is None else acc
    if parent_id in path:
        raise ValueError(f"BOM cycle at {parent_id}")
    for row in state.bom.get(parent_id, []):
        child = row["child_id"]
        need = row["qty_per"] * qty
        if state.materials.get(child, {}).get("is_subassembly"):
            explode(state, child, need, acc, path + (parent_id,))
        else:
            acc[child] = acc.get(child, 0) + need
    return acc
