# EV Smart Inventory Intelligence Backend

FastAPI backend with Firestore, a LangGraph procurement agent, deterministic allocation and risk engines, and scikit-learn delay models. Python 3.10 or newer.

## Quick start without Firebase

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
STORE=memory uvicorn app.main:app --reload
```

On Windows use `.venv\Scripts\activate`, then `$env:STORE="memory"` before `uvicorn`. Open http://127.0.0.1:8000/docs. Memory mode loads demo data and loses everything on restart.

## Firebase setup

1. Create a project at https://console.firebase.google.com.
2. Open Firestore Database, create a database (Native mode, default database, production mode).
3. Open Project settings, Service accounts, Generate new private key. Save the file as `serviceAccountKey.json` in this folder. Never commit it.
4. `cp .env.example .env` and set `FIREBASE_PROJECT_ID`.
5. Verify the connection and load demo data:

```bash
python -m scripts.setup_firebase
```

6. Deploy the security rules, which block all direct client access (the backend uses the Admin SDK and is not affected):

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore --project YOUR_PROJECT_ID
```

7. `uvicorn app.main:app`

Setup options: `--seed demo|master|none`, and `--reset --confirm-project YOUR_PROJECT_ID`, which deletes all application data.

Emulator instead of a real project (needs Java and Node): run `npx firebase-tools emulators:start --only firestore --project demo-ev`, then set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and `FIREBASE_PROJECT_ID=demo-ev` in `.env`.

Free tier: every risk run reads all master data, balances, open POs and orders. With large data sets, raise `SCAN_MINUTES` (0 disables the scheduler) or set `AUTO_RECOMPUTE=false`, and watch usage in the console.

## Configuration

| Variable | Meaning |
|---|---|
| STORE | `firestore` or `memory` |
| API_KEY | If set, requests also need `X-API-Key` |
| LLM_PROVIDER | `auto`, `claude` or `rules` |
| ANTHROPIC_API_KEY | Enables the Claude-driven agent (paid API) |
| ML_ENABLED | Use trained models when present |
| SCAN_MINUTES, AUTO_RECOMPUTE | Risk recompute behaviour |
| RISK_BUFFER_DAYS, PO_BUFFER_PCT | Engine settings |

## Demo

Every request needs `X-User` and `X-Role` headers. Base path `/api/v1`.

| Step | Request | Role |
|---|---|---|
| Post an event twice, see DUPLICATE | `POST /events` | inventory_manager |
| Recompute | `POST /risk/run` | production_planner |
| O103 is HIGH | `GET /orders?risk=HIGH` | production_planner |
| Draft a PO (SUP_A, 200) | `POST /agent/investigate/O103` | production_planner |
| Approve | `POST /recommendations/{rec_id}/decision` with `{"decision":"APPROVE"}` | procurement_officer |
| What-if on the new PO | `POST /simulate` with `{"supplier_delays":[{"material_id":"MCU_AUTO","delay_days":15}]}` | production_planner |

Dates in the demo are relative to the day it is loaded. Load it again after `--reset` if it is old.

```bash
curl -X POST http://127.0.0.1:8000/api/v1/events -H "X-User: asha" -H "X-Role: inventory_manager" -H "Content-Type: application/json" -d '{"event_id":"EVT1001","event_type":"INVENTORY_RECEIVED","material_id":"CELL_21700","quantity":5000,"timestamp":"2026-11-27T09:30:00","source":"warehouse_system"}'
```

Other endpoints: `/events/batch` (up to 1000), `/events?status=REJECTED`, `/admin/replay`, `/health`, `/inventory`, `/inventory/{id}`, `/inventory/shortages`, `/orders`, `/risk/latest`, `/suppliers`, `/suppliers/{id}/materials`, `/agent/ask`, `/recommendations`, `/alerts`, `/alerts/{id}/ack`.

## Agent

LangGraph state graph in `app/agent/runner.py`:

```
agent -> tools -> agent ... -> validate -> approval_gate | no_action | reject
```

`approval_gate` stores a PENDING recommendation. Approval happens later through the REST endpoint; no tool can approve or send anything. At most 8 tool calls. Quantities and dates are checked against tool results, with one retry. Without an Anthropic key the same graph runs with a fixed rule policy, which handles only simple questions on `/agent/ask`.

## Allocation and risk policy

Orders are served by CRD, then creation time, from a dated supply timeline. Partially covered orders still hold what they received. One production line serves all products; line time accumulates as `qty / daily_capacity` and is rounded up to days. HIGH means late or never covered, MEDIUM means slack within the buffer. `assembly_days_per_100` is stored but not used. A shortage includes both missing and late quantity.

## Data, ML and evaluation

```bash
python -m sim.generate_data
python -m app.ml.train
python -m sim.run_experiment
pytest -q
```

Measured on synthetic data with TODAY=2026-11-27:

| Measure | Result |
|---|---|
| Delay model test MAE (n=120) | 1.72 days, against 3.11 for assuming zero delay |
| Miss-CRD classifier F1 (n=800, 14% positive) | 0.685, against 0.785 for the plain rule. ML adds nothing here |
| Order risk, rules only (2000 orders) | precision 1.00, recall 0.50, F1 0.67, ship-date MAE 2.26 days |
| Order risk, with delay model | precision 0.91, recall 0.71, F1 0.80, ship-date MAE 1.89 days |
| Material shortages (35 true) | rules found 26, with delay model 31 (5 false flags) |

The reorder-level baseline flagged nothing in a single day-0 snapshot, so it is not a meaningful comparison. A rolling day-by-day baseline is not implemented.

## Layout

```
app/        config, db, models, schemas, routers, services, agent, ml
sim/        synthetic data and experiment
scripts/    setup_firebase.py
tests/      pytest
```

## Limitations

- Data is synthetic, and the delay distributions were designed for this project.
- `X-User` and `X-Role` are trusted as sent. Do not expose publicly without real authentication.
- One production line, no holiday calendar.
- Replay is not atomic; run it while ingestion is paused.
- Concurrent investigations of the same shortage can create two drafts. Review the queue before approving.
- Detection lead time compared with the baseline and a full-system agent evaluation with a real LLM are not implemented.
- Kafka, Redis and Docker (the blueprint's final phase) are not included.
- Supplier quotes and dates must be verified by a person.
