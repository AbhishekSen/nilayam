"""Shared data loader: fetches from Supabase, parses typologies, derives price_per_sqft."""
from __future__ import annotations

import ast

import pandas as pd

from api.app.db import fetch_projects


def _parse_typologies(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, list):
        return [str(x) for x in value]
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            parsed = ast.literal_eval(s)
            if isinstance(parsed, (list, tuple)):
                return [str(x) for x in parsed]
        except (ValueError, SyntaxError):
            pass
        # Fallback: comma-separated
        return [t.strip() for t in s.split(",") if t.strip()]
    return None


def load_projects_df() -> pd.DataFrame:
    """Fetch all projects and add derived columns. Authoritative source for analytics."""
    rows = fetch_projects()
    df = pd.DataFrame(rows)
    if df.empty:
        return df

    # Derived: price per sqft
    if "minPrice" in df.columns and "minSaleableArea" in df.columns:
        df["price_per_sqft"] = df["minPrice"] / df["minSaleableArea"]

    # Parse typologies once at the boundary so downstream sees a clean list
    if "typologies" in df.columns:
        df["typologies"] = df["typologies"].apply(_parse_typologies)

    return df


def load_projects_records() -> list[dict]:
    """List-of-dicts variant for non-pandas consumers (e.g. /api/properties)."""
    df = load_projects_df()
    if df.empty:
        return []
    return df.where(df.notna(), None).to_dict(orient="records")
