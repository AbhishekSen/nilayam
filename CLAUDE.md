# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

Python 3.9, managed via `uv`. A virtual environment is in the project root (`bin/`, `lib/`).

```bash
# Install dependencies
uv sync

# Fetch data from the API
uv run main.py

# Run a Streamlit dashboard
uv run streamlit run analytics/dashboard.py
uv run streamlit run analytics/undervalued.py
```

## Architecture

The project has two layers:

**1. Data pipeline — `main.py`**
Fetches real estate project listings from the Propsoch API and writes `output.csv`. On each run it loads the existing CSV, fetches all pages from the API (with retry/backoff), merges new rows on top, deduplicates by `id` keeping the freshest API data (`keep='first'` after putting `df_new` before `df_existing` in `concat`), then atomically replaces the file via a temp file + `shutil.move`.

API params (`minBudget`, `maxBudget`, `sortType`, `sortOrder`, `possession`) are at the top of `main.py` — the main knob for changing what gets fetched.

**2. Analytics dashboards — `analytics/`**
Streamlit apps that read `output.csv` via a relative `../output.csv` path. Each dashboard is standalone.

- `dashboard.py` — price-per-sqft vs micromarket average scatter. Color = developer grade, bubble size = popularity (A/Z mapped to 22/10px).
- `undervalued.py` — opportunity scoring. Computes a weighted composite of discount %, PropScore, and developer grade (each min-max normalized). Sidebar lets users adjust weights. Main view is discount% vs PropScore scatter; also includes a ranked table and micromarket breakdown.

## Key data facts

`output.csv` columns relevant to the dashboards:

| Column | Notes |
|---|---|
| `minPrice` / `minSaleableArea` | Used to derive `price_per_sqft` |
| `micromarketPriceAverage` | Benchmark for under/overpricing |
| `propscore` | Float 1.5–4.5 |
| `developerGrade` | Categorical: A, B, C, D, G |
| `popularity` | Categorical: A or Z only (not continuous) |
| `typologies` | Stored as a string repr of a Python list e.g. `"['2BHK', '3BHK']"` |
