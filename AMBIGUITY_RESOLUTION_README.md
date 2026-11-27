# Ambiguity Identification and Resolution — Implementation Approach

This document records how `Ambiguity Identification and Resolution Integration Blueprint.pdf` was integrated into the EV Smart Inventory codebase.

## Goal

Planner questions are checked for ambiguity before any inventory, risk, procurement, or agent service runs. The layer resolves what is safe from live data, asks short clarifications for the rest, and never guesses on data-changing actions.

The golden rule is unchanged and extended: **the LLM may interpret language, but only validated canonical IDs reach deterministic services.** The extractor returns phrases only; resolver code maps those phrases to canonical material, product, supplier, order, and PO IDs from the live store.

## Non-breaking integration strategy

- Added a new endpoint, `POST /api/v1/agent/clarify`, instead of changing the meaning of the existing `POST /api/v1/agent/ask`. Existing API callers keep their old behavior.
- Updated Agent chat to call `/agent/clarify`. `askAgent()` still exists and now also understands the existing `{ result: { answer } }` shape.
- Added optional `slots` parameters to the agent runner, toolbox, and policies. All existing call sites use empty/default slots, so current investigate and ask flows behave exactly as before.
- Added new collections/constants instead of changing existing collection shapes.
- Added configuration-driven alias, intent, unit, and temporal vocabulary in `backend/sim/nlu_config.json`; canonical IDs are not hardcoded in resolver logic.
- All resolutions are computed from live `inventory.load_state(store)` data on every request. No canned answers or precomputed decisions are returned.

## Six deterministic stages

| Stage | Module | Responsibility |
|---|---|---|
| Normalize | `backend/app/nlu/normalizer.py` | ASCII-fold, lowercase, preserve canonical IDs and numbers. |
| Extract | `backend/app/nlu/extractor.py` | Optional Anthropic phrase extraction; returns phrases only. Falls back to config-driven surface phrase extraction when no API key is configured or extraction fails. |
| Resolve | `backend/app/nlu/entity_resolver.py` | Seeds/reads aliases, fuzzy-matches phrases to live canonical IDs, parses units/pack sizes, and resolves directly mentioned IDs. |
| Detect | `backend/app/nlu/detector.py` | Builds the seven ambiguity types: entity, reference, scope, temporal, quantity/unit, intent, missing slot. |
| Decide | `backend/app/nlu/policy.py` | Applies confidence, margin, read/write, no-candidate, and max-question rules. |
| Clarify | `backend/app/nlu/clarifier.py` | Formats 2–4 option questions and stated assumptions for the API/UI. |

`backend/app/nlu/dialogue_state.py` persists `last_order`, `last_material`, `last_supplier`, `pending_ambiguities`, and resolved slots so references such as “same supplier” can be answered safely.

## Resolution policy implemented

- One candidate with confidence `>= NLU_CONFIDENCE` (`0.90` default): auto-resolve and show “Reading this as …”.
- Read-only intent with top candidate leading runner-up by `>= NLU_MARGIN` (`0.25` default): auto-resolve with an explicit assumption.
- Close candidates or confidence below threshold: ask, with 2–4 options and at most `NLU_MAX_QUESTIONS` (`2` default) per turn.
- Write intents (`create_po_draft`, approval, draft PO): always ask for confirmation; never auto-resolve below full confidence. Only after confirmation can `runner.investigate()` create a PENDING draft. No route auto-approves or sends anything.
- No candidates: refuse and list the closest valid IDs from live data.

## Storage

The blueprint’s three SQL tables are mapped to this project’s Firestore/memory collection abstraction:

| Blueprint table | Collection constant | Key |
|---|---|---|
| `aliases` | `models.ALIASES` | `ENTITY_TYPE|alias|entity_id` |
| `dialogue_sessions` | `models.DIALOGUE_SESSIONS` | `SESSION-<hex>` |
| `resolution_log` | `models.RESOLUTION_LOG` | `RES-<hex>` |

`new_id()` is used instead of SQL `AUTOINCREMENT`. All three collections are included in `models.ALL`, so `--reset` clears them and `COLLECTION_PREFIX` applies automatically. Dialogue writes use `store.atomic()`.

Aliases are seeded from live materials, products, and suppliers (IDs and names) plus configured synonyms. Memory mode seeds them during app startup; Firestore mode seeds them during `scripts/setup_firebase.py --seed demo|master`. Lazy seeding also happens on first resolver use if the collection is empty.

## Configuration

`backend/sim/nlu_config.json` contains:

- `synonyms` — hand-written phrase mappings, including the blueprint’s `MCU`/`chip` examples.
- `intents` — read/write intent vocabulary.
- `reference_phrases`, `scope_phrases`, `temporal_phrases`, `delay_units`.
- `unit_multipliers` (`k`, `thousand`, `kWh`) and `pack_units` (`tray`, `pack`, …).
- `delay_options`, `fuzzy_cutoff`, `stopwords`.

Environment overrides in `backend/.env.example`:

```env
NLU_CONFIG_FILE=sim/nlu_config.json
NLU_CONFIDENCE=0.90
NLU_MARGIN=0.25
NLU_MAX_QUESTIONS=2
NLU_SESSION_TTL_MINUTES=60
```

The existing `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, and `ANTHROPIC_MODEL` settings control the optional LLM extractor. With no key, the app still works using the config-driven fallback and existing rules policy; it does not call any external model.

## API contract

`POST /api/v1/agent/clarify`

```json
{
  "question": "What if SUP_A is 5 days late on MCU next week?",
  "session_id": "SESSION-...",
  "answers": ["MCU_AUTO"]
}
```

Response:

```json
{
  "status": "CLARIFY | ANSWERED | REFUSED",
  "session_id": "SESSION-...",
  "answer": "...",
  "questions": [
    {
      "ambiguity_type": "entity",
      "question": "Which material did you mean?",
      "field": "material_id",
      "options": [
        { "id": "MCU_AUTO", "label": "mcu", "score": 0.95 },
        { "id": "MCU_AUTO_B", "label": "mcu", "score": 0.95 }
      ]
    }
  ],
  "interpretations": ["Reading the time window as ..."],
  "trace": [],
  "policy": "rules"
}
```

`CLARIFY` and `REFUSED` are returned as HTTP 200 with a status field so the chat UI can display them without treating them as transport errors. Auth uses the same `PLANNING` roles as `/agent/ask`.

## Frontend behavior

- `client1/src/api/endpoints.ts`: `clarifyAgent()` sends the question, session ID, and selected answers and returns a normalized `ClarifyResult`.
- `client1/src/api/hooks.ts`: `useClarify()` mutation.
- `client1/src/api/types.ts`: `ClarifyInput`, `ClarifyResult`, `ClarificationQuestion`, `ClarificationOption`.
- `client1/src/pages/AgentChatPage.tsx`: renders stated interpretations, option buttons, and tool traces. Answers continue the same backend session.

The UI does not resolve aliases, dates, units, or IDs. It only displays backend-produced questions and sends back the selected option ID.

## Files added or changed

New:

```text
backend/app/nlu/__init__.py
backend/app/nlu/normalizer.py
backend/app/nlu/extractor.py
backend/app/nlu/entity_resolver.py
backend/app/nlu/temporal.py
backend/app/nlu/detector.py
backend/app/nlu/policy.py
backend/app/nlu/clarifier.py
backend/app/nlu/dialogue_state.py
backend/app/routers/clarify.py
backend/sim/nlu_config.json
backend/sim/generate_queries.py
backend/tests/test_nlu_core.py
backend/tests/test_nlu_flow.py
backend/tests/test_nlu_api.py
AMBIGUITY_RESOLUTION_README.md
```

Modified additively:

```text
backend/app/models.py
backend/app/config.py
backend/app/schemas.py
backend/app/main.py
backend/scripts/setup_firebase.py
backend/app/agent/runner.py
backend/app/agent/tools.py
backend/app/agent/policies.py
backend/.env.example
client1/src/api/types.ts
client1/src/api/endpoints.ts
client1/src/api/hooks.ts
client1/src/pages/AgentChatPage.tsx
```

## Verification

```bash
cd backend
./venv/bin/python -m pytest -q

cd ../client1
npm run test -- --run
npm run build
```

At implementation time: `204` backend tests passed, `26` frontend tests passed, and the frontend production build succeeded. The only build output is the existing large-chunk warning.

## Notes

- `python -m sim.generate_queries` generates a synthetic ambiguous-query set from the live catalog and config; it does not hardcode query answers.
- Existing `POST /api/v1/agent/ask` remains available and unchanged for compatibility.
- Approvals and supplier commitments still require human verification as documented in the base project READMEs.
