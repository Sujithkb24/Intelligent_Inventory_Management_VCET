# EV Smart Inventory Intelligence: Web Console

React 18 + Vite + TypeScript frontend implementing the *Web Frontend Implementation Blueprint*.

Golden rule: the UI never computes inventory, allocation, risk or PO quantities. It only displays what the API returns.

## Quick start

```bash
npm install
cp .env.example .env     # a default .env is already included
npm run dev              # http://localhost:5173, /api is proxied to http://localhost:8000
```

Other scripts: `npm run build`, `npm run preview`, `npm test`, `npm run gen:types` (generates `src/api/schema.d.ts` from the FastAPI OpenAPI schema).

## Demo login

There is no login endpoint. The login page stores `{user, role}` in localStorage and the axios interceptor sends them as `X-User` and `X-Role` headers. Roles: `inventory_manager`, `production_planner`, `procurement_officer`, `admin`.

## Structure

```
src/
  config.ts            env, poll intervals, currency, reference products
  api/                 client.ts (axios + error normalisation), types.ts, endpoints.ts, hooks.ts
  auth/                AuthContext, RequireRole, roles.ts (can(role, permission)), session.ts
  components/          layout, common, agent (InvestigateButton, ToolTraceViewer), approval, orders
  pages/               Dashboard, Inventory, MaterialDetail, Orders, OrderDetail, Risk, Simulator,
                       Suppliers, Events, Recommendations(+Detail), Alerts, AgentChat, Admin
  lib/                 format, schemas (Zod), toast, uuid
  tests/               Vitest: permission matrix, Zod schemas, formatters
```

`api/endpoints.ts` is the single place where response shapes are parsed. Shapes the blueprint leaves open (section 16: order detail, material timeline, simulation diff, health, alerts, approval response) are parsed loosely there, so a contract change touches one file.

## Behaviour implemented from the blueprint

- Polling plus invalidation (no WebSocket): inventory, shortages, orders and risk every 30 s, alerts and pending recommendations every 15 s, health every 10 s. Polling pauses in hidden tabs.
- Error handling: 401 clears session, 403 shows "Your role cannot do this", 404 shows "Not found", 409 is treated as "Already decided" (refetch), 5xx shows an error panel with retry. Only `POST /events` is auto-retried (it is idempotent by `event_id`).
- Agent investigation: 120 s timeout, cosmetic timed stepper, navigates to the new PENDING recommendation, never auto-retried.
- Approval: reject requires a reason of 5+ characters (Zod), submit is disabled while pending, approve is disabled on a grounding failure, evidence rendered as a per-tool accordion.
- Simulator: SimulationIn form with demo preset, before/after diff, "Simulation only" banner, last result kept in state.
- Events: auto-generated editable `event_id` (send twice to see DUPLICATE), per-type field validation, JSON/CSV batch upload with per-event results.

## Backend assumptions to confirm (blueprint section 16)

- `POST /events/batch` takes a JSON array and returns an array (or `{results: [...]}`).
- `POST /orders` body is `{product, qty, crd}`.
- `POST /agent/investigate/{id}` returns `rec_id` (or `recommendation.rec_id`).
- `GET /alerts` items have `alert_id` (or `id`), `severity`, `message`, `status`, `ref_id`, `ref_type`.
- Grounding failure: `grounding_failure: true` on the recommendation, or a status containing `GROUNDING`.
- The backend must register `/inventory/shortages` before `/inventory/{material_id}`.
- If calling the API cross-origin, enable CORS for the web origin and allow `X-User` and `X-Role`.

## Known limitations

Polling data can be up to 30 s stale. Header roles are a demo mechanism; the backend is the authority. Agent numbers come from tool outputs and must be verified by a human before approval.
