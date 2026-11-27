import argparse
from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials

from app.config import ROOT, settings
from app.routers.deps import EVERYONE


def main():
    parser = argparse.ArgumentParser(description="Assign a trusted Firebase custom role to an existing user.")
    parser.add_argument("uid", help="Firebase Authentication UID")
    parser.add_argument("role", choices=sorted(set(EVERYONE)))
    args = parser.parse_args()

    if not settings.project_id:
        parser.error("Set FIREBASE_PROJECT_ID in backend/.env first.")
    credential_path = Path(settings.credentials) if settings.credentials else None
    if credential_path and not credential_path.is_absolute():
        credential_path = ROOT / credential_path
    if not credential_path or not credential_path.is_file():
        parser.error("FIREBASE_CREDENTIALS must point to a service-account JSON file.")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(
            credentials.Certificate(str(credential_path)),
            {"projectId": settings.project_id},
        )

    user = auth.get_user(args.uid)
    claims = dict(user.custom_claims or {})
    claims[settings.role_claim] = args.role
    auth.set_custom_user_claims(args.uid, claims)
    print(f"Assigned role '{args.role}' to Firebase user {args.uid}. They must sign in again to refresh claims.")


if __name__ == "__main__":
    main()
