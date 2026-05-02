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
