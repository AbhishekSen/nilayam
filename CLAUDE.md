# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

Python 3.9, managed via `uv`. A virtual environment is in the project root (`bin/`, `lib/`).

```bash
# Install dependencies
uv sync

# Run the script
uv run main.py
# or with the venv activated:
python main.py
```

## What this project does

`main.py` is a single-script data pipeline that:
1. Calls the Propsoch API (`/be/v2/api/project/getProjects`) with budget/sort filters, paginating through all results
2. Merges the fetched data with any existing `output.csv` (deduplicating on `id`)
3. Writes the combined, deduplicated result back to `output.csv`

## Key design points

- **Incremental updates**: The script loads `output.csv` before fetching, then `concat` + `drop_duplicates(subset=['id'], keep='first')` to preserve existing rows and append only new ones.
- **Pagination**: Loop increments `currentPage` until `currentPage >= totalPages` or an empty result is returned.
- **Output**: Flat CSV produced by `pd.json_normalize` on the raw API response — nested fields become dot-separated column names.
- **API params** (`minBudget`, `maxBudget`, `sortType`, `sortOrder`, `possession`) are defined at the top of `main.py` and are the primary knobs for changing what data is fetched.
