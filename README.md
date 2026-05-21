# propsoch

Real estate analytics for Bangalore. Fetches listings from the Propsoch API into Supabase, exposes them through a FastAPI backend, and serves an interactive React + TypeScript frontend with a property map, three analytics dashboards, and a chat-with-the-data agent.

## Architecture

- **Pipeline** — `main.py` fetches listings, deduplicates, writes `output.csv`, and upserts to Supabase.
- **Backend** — `api/` (FastAPI). Owns the Supabase service role key; exposes a narrow whitelisted REST surface at `/api/*`. The chat endpoint streams SSE and uses the OpenAI Agents SDK with the hosted Supabase MCP server + hosted code interpreter.
- **Frontend** — `web/` (React 19 + Vite + TypeScript). Single SPA with five routes: Map + three analytics dashboards + chat. Talks only to `/api`; never to Supabase or OpenAI directly.

## Requirements

- Python 3.9+ with [uv](https://github.com/astral-sh/uv)
- Node.js 18+
- A [Supabase](https://supabase.com) project with a `projects_blr` table
- (For the chat feature) An [OpenAI API key](https://platform.openai.com/api-keys) with billing enabled and a [Supabase personal access token](https://supabase.com/dashboard/account/tokens)

## Setup

```bash
uv sync                    # Python deps (pipeline + backend)
cd web && npm install      # Frontend deps
```

### Environment variables

```bash
cp .env.example .env       # only the project root needs Supabase creds
```

Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The frontend has **no** Supabase or OpenAI env vars — it talks to the backend.

For the chat feature, additionally fill in:

| Var | Source |
|---|---|
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens (a PAT — **not** the service role key) |
| `SUPABASE_PROJECT_REF` | Project ref from your Supabase URL (e.g. `abcd1234efgh`) |
| `CHAT_MODEL` | Optional, defaults to `gpt-4o-mini` |
| `CHAT_RATE_PER_MINUTE` / `CHAT_RATE_PER_DAY` | Optional per-IP rate limits, default `10` / `200` |

For cross-origin frontend deploys, set `VITE_API_BASE` in `web/.env`. In dev or single-origin prod deploys, leave it empty.

## Running

```bash
# Pipeline (one-shot ingestion job)
uv run main.py

# Backend (port 8000)
uv run uvicorn api.app.main:app --port 8000 --reload

# Frontend (port 5173, proxies /api → :8000)
cd web && npm run dev
```

Open http://localhost:5173. The frontend will fetch from `/api/properties` via the Vite proxy.

## Pipeline configuration

Edit the `params` dict at the top of `main.py`:

| Parameter | Default | Description |
|---|---|---|
| `minBudget` | `5000000` | Minimum project budget (INR) |
| `maxBudget` | `10000000` | Maximum project budget (INR) |
| `sortType` | `popularity` | Sort field |
| `sortOrder` | `desc` | Sort direction |
| `possession` | `any` | Possession status filter |

## API surface

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/health` | `{"status": "ok"}` |
| `GET` | `/api/properties` | Whitelisted property rows for the map. |
| `GET` | `/api/analytics/price-vs-market` | Scatter data + KPIs + top-10 outlier tables. |
| `GET` | `/api/analytics/undervalued` | Ranked composite-score candidates + micromarket breakdown. |
| `GET` | `/api/analytics/amenity-premium` | Welch's t-test per amenity + box plot data + drill-down. |
| `POST` | `/api/chat` | SSE stream. Body: `{message, previous_response_id?}`. Emits `text` (token deltas), `tool` (status chips), `image` (base64 PNG), `done` (with `response_id`), `error`. |

The `PropertySummary` Pydantic model in `api/app/models.py` is the column whitelist — fields not declared there never reach the browser, even if added to `projects_blr`.

The chat endpoint sends natural-language questions through the OpenAI Agents SDK. The agent has read-only SQL access to `projects_blr` via the hosted Supabase MCP server and a hosted Python code interpreter for charts. PNGs are inlined as base64 in the SSE stream. Multi-turn conversation state lives in OpenAI Responses (we just thread `previous_response_id`); per-IP token-bucket rate limiting is in `services/rate_limit.py`.

## Frontend pages

| Route | Description |
|---|---|
| `/` | Property map with Leaflet + clustering + auto-fit bounds. |
| `/analytics/price-vs-market` | Price-per-sqft vs micromarket-average scatter. |
| `/analytics/undervalued` | Opportunity scoring (discount × propscore × grade), sliders for weights/thresholds. |
| `/analytics/amenity-premium` | Statistical premium per amenity (Welch's t-test) + per-micromarket drill-down. |
| `/chat` | Conversational agent over `projects_blr`. Streams text + status chips + inline PNG charts. |

## Build

```bash
cd web && npm run build       # production bundle → web/dist/
cd web && npm run typecheck   # tsc -b --noEmit
cd web && npm run lint        # ESLint
```
