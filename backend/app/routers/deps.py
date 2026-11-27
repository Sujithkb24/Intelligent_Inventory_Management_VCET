import secrets
import logging
from pathlib import Path

from fastapi import Header, HTTPException

from app.config import ROOT, settings

log = logging.getLogger("ev_inventory.auth")

PLANNING = ("production_planner", "procurement_officer", "planner_lead", "admin")
INVENTORY = ("inventory_manager", "procurement_officer", "planner_lead", "admin")
EVERYONE = ("inventory_manager", *PLANNING)
APPROVERS = ("procurement_officer", "planner_lead")
ADMIN = ("admin",)


def require(*roles):
    def check(authorization: str = Header(""), x_user: str = Header(""),
              x_role: str = Header(""), x_api_key: str = Header("")):
        if settings.api_key and not secrets.compare_digest(x_api_key.encode(), settings.api_key.encode()):
            raise HTTPException(401, "invalid API key")
        if settings.auth_mode == "demo":
            if settings.store != "memory":
                raise HTTPException(503, "demo authentication is restricted to the memory store")
            user, role = x_user, x_role
            if not user or not role:
                raise HTTPException(401, "demo X-User and X-Role headers are required")
        elif settings.auth_mode == "firebase":
            if not authorization.startswith("Bearer "):
                raise HTTPException(401, "Firebase bearer token is required")
            try:
                import firebase_admin
                from firebase_admin import auth, credentials
                from firebase_admin.exceptions import FirebaseError

                if not firebase_admin._apps:
                    credential = None
                    if settings.credentials:
                        path = Path(settings.credentials)
                        credential = credentials.Certificate(
                            str(path if path.is_absolute() else ROOT / path))
                    options = {"projectId": settings.project_id} if settings.project_id else None
                    firebase_admin.initialize_app(credential, options)
            except (OSError, ValueError) as exc:
                log.exception("Firebase Admin SDK initialization failed")
                raise HTTPException(500, "Firebase authentication is not configured correctly") from exc
            try:
                claims = auth.verify_id_token(authorization[7:].strip(), check_revoked=True)
            except (auth.InvalidIdTokenError, auth.RevokedIdTokenError, auth.UserDisabledError,
                    auth.UserNotFoundError, ValueError) as exc:
                log.info("Firebase token verification rejected request: %s", type(exc).__name__)
                raise HTTPException(401, "invalid or expired Firebase ID token") from exc
            except FirebaseError as exc:
                log.exception("Firebase token verification service failed")
                raise HTTPException(503, "Firebase authentication service is unavailable") from exc
            user = claims.get("uid")
            role = claims.get(settings.role_claim)
            if not user or not isinstance(role, str):
                raise HTTPException(403, "Firebase account has no assigned application role")
        else:
            raise HTTPException(500, "AUTH_MODE must be 'firebase' or 'demo'")
        if role not in roles:
            raise HTTPException(403, f"role {role} is not allowed")
        return {"user": user, "role": role}

    return check
