# propsoch

Fetches real estate project listings from the Propsoch API and saves them to a CSV file. Supports incremental updates — re-running the script merges new data with the existing CSV, keeping fresh API data and removing duplicates.

## Requirements

- Python 3.9+
- [uv](https://github.com/astral-sh/uv)

## Setup

```bash
uv sync
```

## Usage

```bash
uv run main.py
```

On each run the script:
1. Loads `output.csv` if it exists
2. Fetches all pages from the API (with retry/backoff on transient errors)
3. Merges new results with existing data, deduplicating by `id` (fresh API data wins)
4. Atomically writes the result back to `output.csv`

## Configuration

Edit the `params` dict at the top of `main.py` to change what gets fetched:

| Parameter | Default | Description |
|---|---|---|
| `minBudget` | `5000000` | Minimum project budget (INR) |
| `maxBudget` | `10000000` | Maximum project budget (INR) |
| `sortType` | `popularity` | Sort field |
| `sortOrder` | `desc` | Sort direction |
| `possession` | `any` | Possession status filter |

## Output

`output.csv` — one row per project, columns derived from the API response via `pd.json_normalize` (nested fields become dot-separated column names, e.g. `address.city`).

## Analytics Dashboards

Streamlit apps that read `output.csv` for visual analysis:

```bash
uv run streamlit run analytics/dashboard.py      # Price-per-sqft vs micromarket average
uv run streamlit run analytics/undervalued.py     # Opportunity scoring & discount analysis
```

## Interactive Property Map

A React app that renders every property from `output.csv` as a marker on an OpenStreetMap-based map. Click a marker to see its full metadata.

### Setup

```bash
cd map-app
npm install
```

### Development

```bash
npm run dev    # opens at http://localhost:5173
```

### Production build

```bash
npm run build  # output in map-app/dist/
```

### Updating data

Copy a fresh `output.csv` into the map app:

```bash
cp output.csv map-app/public/data/properties.csv
```
