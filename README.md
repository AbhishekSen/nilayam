# propsoch

Real estate project analytics for Bangalore. Fetches listings from the Propsoch API, stores them in Supabase, and provides a Streamlit analytics dashboard and an interactive React map.

## Requirements

- Python 3.9+ with [uv](https://github.com/astral-sh/uv)
- Node.js 18+ (for the map app)
- A [Supabase](https://supabase.com) project with a `projects_blr` table

## Setup

```bash
uv sync                    # Python dependencies
cd map-app && npm install  # React map app dependencies
```

### Environment variables

```bash
cp .env.example .env                     # root — for main.py and analytics
cp map-app/.env.example map-app/.env     # map-app — needs VITE_ prefix
```

Fill in your Supabase credentials in both files. `main.py` uses `SUPABASE_SERVICE_ROLE_KEY` for writes; the analytics and map apps only need `SUPABASE_ANON_KEY` for reads.

## Usage

### Data pipeline

```bash
uv run main.py
```

On each run the script:
1. Loads `output.csv` if it exists
2. Fetches all pages from the API (with retry/backoff on transient errors)
3. Merges new results with existing data, deduplicating by `id` (fresh API data wins)
4. Atomically writes the result to `output.csv`
5. Upserts all rows to Supabase (`projects_blr`)

### Configuration

Edit the `params` dict at the top of `main.py` to change what gets fetched:

| Parameter | Default | Description |
|---|---|---|
| `minBudget` | `5000000` | Minimum project budget (INR) |
| `maxBudget` | `10000000` | Maximum project budget (INR) |
| `sortType` | `popularity` | Sort field |
| `sortOrder` | `desc` | Sort direction |
| `possession` | `any` | Possession status filter |

## Analytics Dashboards

A multipage Streamlit app that reads from Supabase for visual analysis:

```bash
uv run streamlit run analytics/app.py
```

| Page | Description |
|---|---|
| Price vs Market | Price-per-sqft vs micromarket average scatter |
| Undervalued | Opportunity scoring & discount analysis |
| Amenity Premium | Statistical analysis of amenity price premiums |

## Interactive Property Map

A React + Vite + Leaflet app that renders every property as a marker on an OpenStreetMap-based map, reading data from Supabase. Click a marker to see its full metadata.

```bash
cd map-app
npm run dev    # dev server at http://localhost:5173
npm run build  # production build → dist/
npm run lint   # ESLint
```
