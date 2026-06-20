# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

Python 3.9, managed via `uv`. A virtual environment is in the project root.

```bash
# Install dependencies
uv sync                  # Python (main.py + FastAPI backend)
cd web && npm install    # React + TypeScript frontend

# Environment setup
# Backend (.env in project root): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
#   SUPABASE_JWT_SECRET (verifies user JWTs server-side),
#   OPENAI_API_KEY, SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF (for chat),
#   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID_PAID, APP_URL (for billing).
# Frontend (web/.env): VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (anon key is public-safe;
#   the browser uses Supabase Auth directly to obtain JWTs, then attaches them to /api requests).
cp .env.example .env
cp web/.env.example web/.env

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
Owns Supabase access (server-side service role key) and exposes a narrow REST surface. The browser uses Supabase Auth directly for sign-in, then attaches the resulting JWT to every `/api/*` call. The backend verifies JWTs locally and never proxies Supabase data queries. Layout:

- `api/app/main.py` — FastAPI app + CORS + router mounts.
- `api/app/db.py` — Supabase client (cached, service role key).
- `api/app/auth.py` — `get_current_user` FastAPI dependency. Inspects the JWT header to pick the verification path: **ES256** tokens are verified against the public key fetched from `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (cached for 5min by `PyJWKClient`); **HS256** tokens fall back to `SUPABASE_JWT_SECRET` for projects still on the legacy shared-secret signing key. Loads the user's `profiles` row and exposes `CurrentUser.effective_tier` (handles the "paid until period end" cancel grace).
- `api/app/models.py` — Pydantic response models. **`PropertySummary` is the column whitelist for `/api/properties`** — adding a column to `projects_blr` does NOT make it visible to the frontend until it's added here.
- `api/app/services/data.py` — shared loader; adds `price_per_sqft` and parses `typologies` from the Python-list-string into a real list.
- `api/app/services/{price_vs_market,undervalued,amenity_premium}.py` — pandas/scipy logic ported from the retired Streamlit pages.
- `api/app/services/chat_agent.py` — OpenAI Agents SDK wiring. Builds an `Agent` with a `HostedMCPTool` pointing at the hosted Supabase MCP server (`mcp.supabase.com`, read-only, `database` feature only) plus a hosted `CodeInterpreterTool` for chart PNGs. Exposes `ask()` (single-shot) and `stream()` (async generator of `{event, data}` dicts: `text`, `tool`, `image`, `done`, `error`).
- `api/app/services/rate_limit.py` — in-memory per-IP token-bucket limiter, two buckets (per-minute + per-day). Single-process only; swap to Redis if you scale uvicorn workers.
- `api/app/services/profiles.py` — CRUD over the `profiles` table (one row per `auth.users` user, tier + Stripe IDs).
- `api/app/services/usage.py` — `chat_usage` insert + rolling 7-day count for free-tier quota.
- `api/app/services/billing.py` — Stripe wrapper: `create_checkout_session`, `create_portal_session`, `handle_webhook`. Webhook handler maps `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, and `invoice.payment_failed` events into `profiles` updates.
- `api/app/routers/{me,properties,analytics,chat,billing}.py` — route definitions. Every endpoint except `/api/health` and `/api/billing/webhook` requires `Depends(get_current_user)`. `chat.py` additionally enforces the 5-chats-per-7-days quota for free-tier users and records each successful chat in `chat_usage`.

Endpoints (all require `Authorization: Bearer <supabase-jwt>` except where noted):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness probe. No auth. |
| `GET` | `/api/me` | Current user's profile, tier, and chat-quota usage. |
| `GET` | `/api/properties` | Whitelisted property rows for the map. |
| `GET` | `/api/analytics/price-vs-market` | Scatter data + KPIs + top-10 outlier tables. |
| `GET` | `/api/analytics/undervalued` | Composite-score ranked candidates + micromarket breakdown. |
| `GET` | `/api/analytics/amenity-premium` | Welch's t-test per amenity + box plot data + drill-down. |
| `POST` | `/api/chat` | SSE stream. Body: `{message, previous_response_id?}`. Events: `text` (delta), `tool` (status chip), `image` (base64 PNG), `done` (carries `response_id`), `error`. Returns 429 with upgrade copy when the free-tier user has hit the 5/7d cap. |
| `POST` | `/api/billing/checkout` | Returns a Stripe Checkout Session URL for upgrading to paid. |
| `POST` | `/api/billing/portal` | Returns a Stripe Customer Portal URL for managing the subscription. |
| `POST` | `/api/billing/webhook` | Stripe event sink. No auth; verified via `Stripe-Signature` + `STRIPE_WEBHOOK_SECRET`. |

All analytics endpoints accept filter query params (`city`, `developerGrade`, `projectStatus`, `micromarket`); each page sends only what's relevant to its sidebar. **Filter options shipped in each response are derived from the unfiltered dataset** so dropdowns stay populated as the user filters.

**Chat agent specifics.** The MCP server runs on OpenAI's side, not in this process — we hand them the URL (`https://mcp.supabase.com/mcp?project_ref=…&read_only=true&features=database`) plus a bearer header carrying `SUPABASE_ACCESS_TOKEN`, and they round-trip tool calls. `allowed_tools` is whitelisted to `list_tables`, `execute_sql`, `list_extensions`. The model also gets the schema for `projects_blr` in its system prompt (including the `typologies::jsonb ?` filter trick) so it can write SQL without first calling `list_tables`. Multi-turn continuation uses `previous_response_id` from the prior `done` event — history lives in OpenAI Responses state, not in our DB.

Rate limit defaults (env-overridable): `CHAT_RATE_PER_MINUTE=10`, `CHAT_RATE_PER_DAY=200`. Limiter check runs before any OpenAI call, returning HTTP 429. This is per-IP and complementary to the per-user free-tier cap.

**Auth and tiers.** Sign-up is open via Google OAuth. A Postgres trigger (`handle_new_user`) creates a row in `public.profiles` with `tier='free'` whenever a row lands in `auth.users`. Free tier = 5 chats per rolling 7 days (`chat_usage` row count over `created_at > now() - interval '7 days'`); paid tier = unlimited. The `effective_tier` property in `CurrentUser` returns `'paid'` while `subscription_status` is active/trialing/past_due OR `current_period_end > now()`, so cancels keep working until the paid period actually ends. Tier enforcement happens in `chat.py` before invoking the agent; the row in `chat_usage` is inserted in the `finally` block of the SSE generator only on non-error completions. Schema lives at `supabase/migrations/20260522000000_auth_tiers_and_chat_usage.sql`.

**3. Frontend — `web/` (React 19 + Vite + TypeScript)**
SPA with `react-router-dom@7`. `<AuthProvider>` wraps `<DataProvider>` at the root. AuthProvider subscribes to `supabase.auth.onAuthStateChange`, exposes `{ session, user, me, loading, signInWithGoogle, signOut, refreshMe }` via `useAuth()`, and fetches `GET /api/me` whenever the session changes. `<ProtectedRoute>` redirects unauthenticated users to `/login`. `<DataProvider>` lazily fetches `/api/properties` once a session exists (re-fires on auth change) and shares it via context (`useData()` hook). Routes:

- `/login` — Google OAuth button (public).
- `/auth/callback` — handles the Supabase OAuth code-exchange redirect (public).
- `/` — Map (`pages/Map.tsx`, uses Leaflet + `MarkerClusterGroup` when >500 properties + `FitBounds` for auto-zoom).
- `/analytics/price-vs-market` — Plotly scatter, KPI row, outlier tables.
- `/analytics/undervalued` — sliders for thresholds + score weights, scatter with threshold lines, ranked candidates table.
- `/analytics/amenity-premium` — bar + box plots, summary table, drill-down by amenity per micromarket.
- `/chat` — natural-language chat against `projects_blr` (`pages/Chat.tsx` + `hooks/useChat.ts` + `components/ChatMessage.tsx`). Consumes the SSE stream with `fetch` + manual `\n\n` splitting (EventSource doesn't support POST), tracks `previous_response_id` for multi-turn, renders fenced ` ```sql ` blocks as `<pre>` and PNG events as inline `<img src="data:…">`. A 429 response is surfaced as an upgrade CTA via `quotaHit`.
- `/billing` — current tier + chat usage. Upgrade button → `POST /api/billing/checkout` → redirect to Stripe Checkout. Paid users see a "Manage subscription" button → `POST /api/billing/portal` → Stripe Customer Portal.

`lib/api.ts:request()` injects `Authorization: Bearer <access_token>` from `supabase.auth.getSession()` on every call and signs the user out + redirects to `/login` on 401. `hooks/useChat.ts` does the same manually for its SSE POST.

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
