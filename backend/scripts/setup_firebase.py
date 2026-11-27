import argparse
import sys
from pathlib import Path

from app import models
from app.config import ROOT, settings
from app.db import get_store, now_iso, set_store
from app.services import risk
from sim.generate_data import load_demo, load_master


def preflight():
    problems = []
    if settings.store != "firestore":
        problems.append("STORE must be 'firestore' in .env")
    if not settings.project_id:
        problems.append("FIREBASE_PROJECT_ID is empty in .env")
    import os

    if not os.getenv("FIRESTORE_EMULATOR_HOST"):
        path = Path(settings.credentials) if settings.credentials else None
        if path and not path.is_absolute():
            path = ROOT / path
        if not path or not path.exists():
            problems.append("FIREBASE_CREDENTIALS must point to your service account JSON file")
        else:
            settings.credentials = str(path)
    return problems


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", choices=["demo", "master", "none"], default="demo")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--confirm-project", default="")
    args = parser.parse_args()
    problems = preflight()
    if problems:
        sys.exit("Setup cannot continue:\n- " + "\n- ".join(problems))
    set_store(None)
    store = get_store()
    store.set(models.META, "setup", {"checked_at": now_iso()})
    if not store.get(models.META, "setup"):
        sys.exit("Firestore write/read check failed")
    print(f"Connected to Firestore project {settings.project_id}")
    if args.reset:
        if args.confirm_project != settings.project_id:
            sys.exit(f"--reset deletes all data. Add --confirm-project {settings.project_id}")
        for collection in models.ALL:
            store.clear(collection)
        print("Cleared application collections")
    if args.seed == "master":
        load_master(store)
        print("Loaded master data")
    elif args.seed == "demo":
        results = load_demo(store, settings.today())
        print(f"Loaded demo data: {sum(r.status == 'APPLIED' for r in results)} events applied, "
              f"{sum(r.status == 'DUPLICATE' for r in results)} already present")
        run = risk.run_and_store(store, actor="setup")
        print(f"Risk run {run['run_id']} stored")


if __name__ == "__main__":
    main()
