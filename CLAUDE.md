# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

Python 3.9, managed via `uv`. A virtual environment is in the project root (`bin/`, `lib/`).

```bash
# Install dependencies
uv sync                    # Python
cd map-app && npm install  # React map app

# Environment setup (both apps need Supabase credentials)
cp .env.example .env                       # root — for main.py and analytics
cp map-app/.env.example map-app/.env       # map-app — needs VITE_ prefix
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY (and SERVICE_ROLE_KEY for main.py)

# Fetch data from the API (writes CSV + upserts to Supabase)
uv run main.py

# Run the consolidated Streamlit dashboard (all pages)
uv run streamlit run analytics/app.py

# Run the interactive property map
cd map-app && npm run dev      # dev server at http://localhost:5173
cd map-app && npm run build    # production build → dist/
cd map-app && npm run lint     # ESLint
```

## Architecture

The project has three layers. Data is stored in Supabase (table `projects_blr`) and also written to `output.csv` as a fallback:

**1. Data pipeline — `main.py`**
Fetches real estate project listings from the Propsoch API (`/be/v2/api/project/getProjects`) and writes `output.csv` + upserts to Supabase (`projects_blr`). On each run it loads the existing CSV, paginates through the API (with retry/exponential backoff on 429/5xx, 0.5s delay between pages), merges new rows on top, deduplicates by `id` keeping the freshest API data (`keep='first'` after putting `df_new` before `df_existing` in `concat`), then atomically replaces the CSV file via a temp file + `shutil.move`, and upserts all rows to Supabase.

API params (`minBudget`, `maxBudget`, `sortType`, `sortOrder`, `possession`) are at the top of `main.py` — the main knob for changing what gets fetched.

**2. Analytics dashboards — `analytics/`**
Consolidated multipage Streamlit app. Entry point is `analytics/app.py` which provides shared cached data loading (`load_data()` with `@st.cache_data`) from Supabase and page navigation via `st.navigation()`. Pages live in `analytics/pages/`:

- `1_Price_vs_Market.py` — price-per-sqft vs micromarket average scatter. Color = developer grade, bubble size = popularity (A/Z mapped to 22/10px). Includes top-10 under/overpriced tables.
- `2_Undervalued.py` — opportunity scoring. Computes a weighted composite of discount %, PropScore, and developer grade (each min-max normalized, default weights 40/35/25). Sidebar lets users adjust weights. Main view is discount% vs PropScore scatter; also includes a ranked table and micromarket breakdown.
- `3_Amenity_Premium.py` — Welch's t-test comparing price/sqft for projects with vs without each amenity (petPark, squash, pharmacy, basketball, heatedPool). Includes per-micromarket breakdown to disentangle location effects.

**3. Interactive map — `map-app/`**
React 19 + Vite + Leaflet app. Reads property data from Supabase (`projects_blr`) via `@supabase/supabase-js`, renders each property as a map marker centered on Bangalore (12.97°N, 77.59°E). Uses `MarkerClusterGroup` when >500 properties for performance. `FitBounds` auto-zooms to fit all markers. Click a marker for a popup with full metadata.

## Key data facts

`projects_blr` columns relevant to the dashboards:

| Column | Notes |
|---|---|
| `minPrice` / `minSaleableArea` | Used to derive `price_per_sqft` |
| `micromarketPriceAverage` | Benchmark for under/overpricing |
| `propscore` | Float 1.5–4.5 |
| `developerGrade` | Categorical: A, B, C, D, G (mapped to 5–1 in scoring) |
| `popularity` | Categorical: A or Z only (not continuous) |
| `typologies` | Stored as a string repr of a Python list e.g. `"['2BHK', '3BHK']"` — use `ast.literal_eval()` to parse |
| `latitude` / `longitude` | Used by map-app; rows with invalid coords are silently skipped |
| `petPark`, `squash`, `pharmacy`, `basketball`, `heatedPool` | Binary 0/1 amenity flags |
