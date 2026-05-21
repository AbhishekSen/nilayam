# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

Python 3.9, managed via `uv`. A virtual environment is in the project root.

```bash
# Install dependencies
uv sync                  # Python (main.py + FastAPI backend)
cd web && npm install    # React + TypeScript frontend

# Environment setup — only the project root needs Supabase creds.
# The frontend has NO Supabase env vars; it talks to the backend over /api.
cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (plus SUPABASE_ANON_KEY for fallback).
# For the chat feature, also fill in OPENAI_API_KEY and SUPABASE_ACCESS_TOKEN
# (a personal access token from https://supabase.com/dashboard/account/tokens —
# this is NOT the service role key) and SUPABASE_PROJECT_REF.

# Fetch listings from the Propsoch API → CSV + Supabase
uv run main.py

# Run the FastAPI backend (serves /api/properties + /api/analytics/* + /api/chat)
uv run uvicorn api.app.main:app --port 8000 --reload

# Run the frontend (dev server at http://localhost:5173, proxies /api → :8000)
cd web && npm run dev
cd web && npm run build       # production build → web/dist/
cd web && npm run lint
cd web && npm run typecheck
```

No Python test suite is configured. Frontend quality checks are `npm run lint` and `npm run typecheck`.

`main.py` prefers `SUPABASE_SERVICE_ROLE_KEY` and falls back to `SUPABASE_ANON_KEY`, but upserts will fail under typical RLS with the anon key — use the service role key for the pipeline. The FastAPI backend uses the same env var.

Python 3.9 cannot natively parse `X | None` annotations used by `openai-agents`; the `eval_type_backport` package (already in `pyproject.toml`) patches this at import time. Bumping the project to 3.10+ would let us drop it.

## Architecture

Three layers. Data is stored in Supabase (table `projects_blr`) and mirrored to `output.csv`.

**1. Data pipeline — `main.py`**
Fetches real estate listings from the Propsoch API (`/be/v2/api/project/getProjects`) and writes `output.csv` + upserts to Supabase. Each run loads the existing CSV, paginates through the API (retry/exponential backoff on 429/5xx, 0.5s delay between pages), merges new rows on top, deduplicates by `id` keeping the freshest API data (`keep='first'` after putting `df_new` before `df_existing` in `concat`), atomically replaces the CSV via temp file + `shutil.move`, and upserts to Supabase.

If the API returns zero projects, the script `exit(0)`s before touching the CSV or Supabase — a transient empty response won't corrupt existing data, but also won't refresh anything.

API params (`minBudget`, `maxBudget`, `sortType`, `sortOrder`, `possession`) are at the top of `main.py` — the main knob for changing what gets fetched.

**2. FastAPI backend — `api/`**
Owns Supabase access (server-side service role key) and exposes a narrow REST surface. The browser never talks to Supabase directly. Layout:

- `api/app/main.py` — FastAPI app + CORS + router mounts.
- `api/app/db.py` — Supabase client (cached, service role key).
- `api/app/models.py` — Pydantic response models. **`PropertySummary` is the column whitelist for `/api/properties`** — adding a column to `projects_blr` does NOT make it visible to the frontend until it's added here.
- `api/app/services/data.py` — shared loader; adds `price_per_sqft` and parses `typologies` from the Python-list-string into a real list.
- `api/app/services/{price_vs_market,undervalued,amenity_premium}.py` — pandas/scipy logic ported from the retired Streamlit pages.
- `api/app/services/chat_agent.py` — OpenAI Agents SDK wiring. Builds an `Agent` with a `HostedMCPTool` pointing at the hosted Supabase MCP server (`mcp.supabase.com`, read-only, `database` feature only) plus a hosted `CodeInterpreterTool` for chart PNGs. Exposes `ask()` (single-shot) and `stream()` (async generator of `{event, data}` dicts: `text`, `tool`, `image`, `done`, `error`).
- `api/app/services/rate_limit.py` — in-memory per-IP token-bucket limiter, two buckets (per-minute + per-day). Single-process only; swap to Redis if you scale uvicorn workers.
- `api/app/routers/{properties,analytics,chat}.py` — route definitions. `chat.py` consumes `chat_agent.stream()` and re-emits it as `text/event-stream` SSE.

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness probe. |
| `GET` | `/api/properties` | Whitelisted property rows for the map. |
| `GET` | `/api/analytics/price-vs-market` | Scatter data + KPIs + top-10 outlier tables. |
| `GET` | `/api/analytics/undervalued` | Composite-score ranked candidates + micromarket breakdown. |
| `GET` | `/api/analytics/amenity-premium` | Welch's t-test per amenity + box plot data + drill-down. |
| `POST` | `/api/chat` | SSE stream. Body: `{message, previous_response_id?}`. Events: `text` (delta), `tool` (status chip), `image` (base64 PNG), `done` (carries `response_id`), `error`. |

All analytics endpoints accept filter query params (`city`, `developerGrade`, `projectStatus`, `micromarket`); each page sends only what's relevant to its sidebar. **Filter options shipped in each response are derived from the unfiltered dataset** so dropdowns stay populated as the user filters.

**Chat agent specifics.** The MCP server runs on OpenAI's side, not in this process — we hand them the URL (`https://mcp.supabase.com/mcp?project_ref=…&read_only=true&features=database`) plus a bearer header carrying `SUPABASE_ACCESS_TOKEN`, and they round-trip tool calls. `allowed_tools` is whitelisted to `list_tables`, `execute_sql`, `list_extensions`. The model also gets the schema for `projects_blr` in its system prompt (including the `typologies::jsonb ?` filter trick) so it can write SQL without first calling `list_tables`. Multi-turn continuation uses `previous_response_id` from the prior `done` event — history lives in OpenAI Responses state, not in our DB.

Rate limit defaults (env-overridable): `CHAT_RATE_PER_MINUTE=10`, `CHAT_RATE_PER_DAY=200`. Limiter check runs before any OpenAI call, returning HTTP 429.

**3. Frontend — `web/` (React 19 + Vite + TypeScript)**
SPA with `react-router-dom@7`. `<DataProvider>` at the root fetches `/api/properties` once and shares it via context (`useData()` hook). Routes:

- `/` — Map (`pages/Map.tsx`, uses Leaflet + `MarkerClusterGroup` when >500 properties + `FitBounds` for auto-zoom).
- `/analytics/price-vs-market` — Plotly scatter, KPI row, outlier tables.
- `/analytics/undervalued` — sliders for thresholds + score weights, scatter with threshold lines, ranked candidates table.
- `/analytics/amenity-premium` — bar + box plots, summary table, drill-down by amenity per micromarket.
- `/chat` — natural-language chat against `projects_blr` (`pages/Chat.tsx` + `hooks/useChat.ts` + `components/ChatMessage.tsx`). Consumes the SSE stream with `fetch` + manual `\n\n` splitting (EventSource doesn't support POST), tracks `previous_response_id` for multi-turn, renders fenced ` ```sql ` blocks as `<pre>` and PNG events as inline `<img src="data:…">`.

Plotly is loaded lazily via `React.lazy` (`components/Plot.tsx`) so the map route doesn't carry the ~1MB chart bundle.

The `/api` Vite dev proxy (in `vite.config.ts`) routes to `http://localhost:8000` so dev needs no CORS configuration. In prod, the plan is single-origin (FastAPI serves `web/dist` via `StaticFiles`, or both behind a reverse proxy). For cross-origin deploys, set `VITE_API_BASE` in `web/.env`.

Filter components in `web/src/components/Filters.tsx` (`MultiSelectFilter`, `RangeFilter`, `BooleanFilter`, `DateRangeFilter`) are reused across the map and analytics pages. The schema-inference logic in `utils/filterSchema.ts` powers the map's auto-generated sidebar.

## Key data facts

`projects_blr` columns the app uses:

| Column | Notes |
|---|---|
| `minPrice` / `minSaleableArea` | Derive `price_per_sqft` server-side in `services/data.py`. |
| `micromarketPriceAverage` | Benchmark for under/overpricing. |
| `propscore` | Float ~1.5–4.5. |
| `developerGrade` | Categorical: A, B, C, D, G (mapped to 5–1 in scoring). |
| `popularity` | Categorical A/Z; mapped to 22/10px bubble size in plots. |
| `typologies` | Stored as a Python-list-repr string (`"['2BHK', '3BHK']"`). Parsed server-side; the frontend always sees a real `string[]`. |
| `latitude` / `longitude` | Used by the map page; rows with invalid coords are silently skipped client-side via `validateCoordinates`. |
| `petPark`, `squash`, `pharmacy`, `basketball`, `heatedPool` | Binary 0/1 amenity flags. |

Columns excluded from `PropertySummary` (and therefore invisible to the browser): `type`, `developerId`, `micromarketId`. Add others to the whitelist as needed; the model in `api/app/models.py` is the contract.
