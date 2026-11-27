import secrets

from fastapi import Header, HTTPException

from app.config import settings

PLANNING = ("production_planner", "procurement_officer", "planner_lead", "admin")
INVENTORY = ("inventory_manager", "procurement_officer", "planner_lead", "admin")
EVERYONE = ("inventory_manager", *PLANNING)
APPROVERS = ("procurement_officer", "planner_lead")
ADMIN = ("admin",)


def require(*roles):
    def check(x_user: str = Header(...), x_role: str = Header(...), x_api_key: str = Header("")):
        if settings.api_key and not secrets.compare_digest(x_api_key.encode(), settings.api_key.encode()):
            raise HTTPException(401, "invalid API key")
        if x_role not in roles:
            raise HTTPException(403, f"role {x_role} is not allowed")
        return {"user": x_user, "role": x_role}

    return check
