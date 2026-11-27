# EV Smart Inventory Intelligence Backend

FastAPI backend with Firestore, a LangGraph procurement agent, deterministic allocation and risk engines, and scikit-learn delay models. Python 3.10 or newer.

## Quick start without Firebase

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
AUTH_MODE=demo STORE=memory uvicorn app.main:app --reload
```

On Windows activate with `.venv\Scripts\Activate.ps1`, copy `.env.example` to `.env`, and set `STORE=memory` and `AUTH_MODE=demo` in `.env` before running `uvicorn app.main:app --reload`. Open http://127.0.0.1:8000/docs. Memory/demo mode loads sample data and loses everything on restart. It trusts `X-User` and `X-Role` headers and must never be exposed publicly.

## Firebase setup

1. Create a project at https://console.firebase.google.com and enable Email/Password in Authentication > Sign-in method.
2. Create a Firestore database in Native mode.
3. In Project settings > Service accounts, generate a private key. Save it as `serviceAccountKey.json` in this folder. Never commit or share it.
4. Copy `.env.example` to `.env`; set `FIREBASE_PROJECT_ID`, `FIREBASE_CREDENTIALS=serviceAccountKey.json`, and `AUTH_MODE=firebase`. Keep `STORE=firestore`.
5. Verify Firestore and load demo data:

```bash
python -m scripts.setup_firebase
```

6. Create accounts in Firebase Authentication and assign trusted roles using each user's Authentication UID:

```bash
python -m scripts.set_firebase_role FIREBASE_AUTH_UID production_planner
```

Supported roles: `inventory_manager`, `production_planner`, `procurement_officer`, `planner_lead`, `admin`. The command preserves other claims; users must sign out and back in after a role update. Never allow users to assign their own role.

7. In `client1/.env`, configure `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID` from Project settings > General > Your apps. The web API key is public; do not put the service-account key in the frontend.
8. Deploy the security rules, which block all direct client access (the backend uses the Admin SDK and is not affected):

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore --project YOUR_PROJECT_ID
```

9. Run `uvicorn app.main:app` from this folder and `npm run dev` from `client1`.

Setup options: `--seed demo|master|none`, and `--reset --confirm-project YOUR_PROJECT_ID`, which deletes all application data.

Emulator instead of a real project (needs Java and Node): run `npx firebase-tools emulators:start --only firestore --project demo-ev`, then set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and `FIREBASE_PROJECT_ID=demo-ev` in `.env`.

Free tier: every risk run reads all master data, balances, open POs and orders. With large data sets, raise `SCAN_MINUTES` (0 disables the scheduler) or set `AUTO_RECOMPUTE=false`, and watch usage in the console.

## Configuration

| Variable | Meaning |
|---|---|
| STORE | `firestore` or `memory` |
| API_KEY | If set, requests also need `X-API-Key` |
| AUTH_MODE | `firebase` (default) verifies bearer tokens and trusted role claims; `demo` is restricted to `STORE=memory` |
| FIREBASE_ROLE_CLAIM | Custom claim name containing the user's role; defaults to `role` |
| CORS_ORIGINS | Optional comma-separated browser origins |
| LLM_PROVIDER | `auto`, `claude` or `rules` |
| ANTHROPIC_API_KEY | Enables the Claude-driven agent (paid API) |
| ML_ENABLED | Use trained models when present |
| SCAN_MINUTES, AUTO_RECOMPUTE | Risk recompute behaviour |
| RISK_BUFFER_DAYS, PO_BUFFER_PCT | Engine settings |
| KAFKA_BOOTSTRAP_SERVERS, KAFKA_TOPIC | Optional Kafka/Redpanda stream for applied events; Firestore outbox delivers at-least-once |
| REDIS_URL, REDIS_CACHE_TTL | Optional Redis cache for store reads; writes invalidate cached reads |

### Kafka and Redis

Start local Redis and Redpanda (Kafka API) from this folder:

```bash
docker compose up -d redis redpanda
```

Set `REDIS_URL=redis://localhost:6379/0` and `KAFKA_BOOTSTRAP_SERVERS=localhost:19092` in `backend/.env`, then start the backend. Kafka messages include the source event and use its `event_id` as the message key; consumers should deduplicate because outbox delivery is at-least-once. Redis is optional. If configured but unreachable, startup fails explicitly instead of silently bypassing the cache.

## Demo

In local demo mode, requests use `X-User` and `X-Role` headers. Firebase mode requires `Authorization: Bearer <Firebase ID token>`; the backend derives identity and role from the verified token. Base path `/api/v1`.

| Step | Request | Role |
|---|---|---|
| Post an event twice, see DUPLICATE | `POST /events` | inventory_manager |
| Recompute | `POST /risk/run` | production_planner |
| O103 is HIGH | `GET /orders?risk=HIGH` | production_planner |
| Draft a PO (SUP_A, 200) | `POST /agent/investigate/O103` | production_planner |
| Approve | `POST /recommendations/{rec_id}/decision` with `{"decision":"APPROVE"}` | procurement_officer |
| What-if on the new PO | `POST /simulate` with `{"supplier_delays":[{"material_id":"MCU_AUTO","delay_days":15}]}` | production_planner |

Dates in the demo are relative to the day it is loaded. Load it again after `--reset` if it is old.

### Playground scenarios

| Order | Product | Scenario |
|---|---|---|
| O103 | SCOOT_S, 150 | `MCU_AUTO` is short; HIGH risk with a draftable PO from SUP_A |
| O107 | SCOOT_X, 60 | `SENSOR_LIDAR` is short; HIGH risk, single-source SUP_E with a 56-day lead time |
| O104-O106 | SCOOT_S / SCOOT_P / HATCH_C | LOW-risk orders that consume the remaining MCU_AUTO stock; useful for simulating delays |

`SCOOT_X` uses `BATT_LFP` and `SENSOR_LIDAR` instead of `MCU_AUTO`, so it exercises a different bottleneck. To create another order from the UI, use **Orders -> New order** (Order ID is pre-filled) and then **Run risk**.

A PO is opened only through approval: investigate a HIGH-risk order, then approve the PENDING recommendation as `procurement_officer` or `planner_lead`. Approval creates an OPEN `PO-{rec_id}` record; nothing is sent to the supplier.

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

`python -m sim.run_experiment` also reports rolling day-by-day baseline and forecast detection counts, misses, mean/median lead days, and difference in mean lead. The discrete-day simulator consumes demand on the calculated material-need-by date and uses generated actual PO delay for ground truth; this remains synthetic, not a production measurement.

On the default 10 scenarios (seed 300-309, TODAY=2026-11-27), the reorder baseline detected 35/35 true shortages with 39.2 mean lead days, but also raised 68 false flags. The forecast detector caught 33/35 (2 late, no false flags), with 54.82 mean lead days; across the 33 shortages both detected, it warned an average 15.06 days earlier. These are synthetic results, not a claim about real operational inventory.

Run the opt-in live agent evaluation only after configuring `ANTHROPIC_API_KEY`:

```bash
python -m sim.evaluate_agent
python -m sim.evaluate_agent --cases 1
```

This makes real, billable Claude requests on seeded demo data. The JSON report checks tool grounding, task outcomes, token usage, and verifies that an investigation creates only a PENDING recommendation (no purchase order is placed without human approval). It exits non-zero if an evaluation or safety check fails.

## Layout

```
app/        config, db, models, schemas, routers, services, agent, ml
sim/        synthetic data and experiment
scripts/    setup_firebase.py
tests/      pytest
```

## Limitations

- Data is synthetic, and the delay distributions were designed for this project.
- Firebase ID tokens and server-issued role claims are required by default. `AUTH_MODE=demo` trusts role headers and must remain local-only.
- One production line, no holiday calendar.
- Replay is not atomic; run it while ingestion is paused.
- Concurrent investigations of the same shortage can create two drafts. Review the queue before approving.
- Supplier quotes and dates must be verified by a person.
