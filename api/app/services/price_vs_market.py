"""Port of analytics/pages/1_Price_vs_Market.py — pandas logic, no UI."""
from __future__ import annotations

from typing import Optional

import pandas as pd

from api.app.models import (
    FilterOptions,
    PriceVsMarketKPIs,
    PriceVsMarketOutlier,
    PriceVsMarketResponse,
    PriceVsMarketScatterPoint,
)
from api.app.services.data import load_projects_df

GRADE_ORDER = ["A", "B", "C", "D", "G"]
TOP_N = 10
POPULARITY_BUBBLE = {"A": 22, "Z": 10}
DEFAULT_BUBBLE = 10


def _records(df: pd.DataFrame) -> list[dict]:
    """DataFrame → list[dict] with NaN replaced by None (JSON-safe)."""
    if df.empty:
        return []
    return df.where(df.notna(), None).to_dict(orient="records")


def compute(
    cities: Optional[list[str]] = None,
    developer_grades: Optional[list[str]] = None,
    project_statuses: Optional[list[str]] = None,
    show_only_underpriced: bool = False,
) -> PriceVsMarketResponse:
    df = load_projects_df()

    # Need price + benchmark to plot a point
    df = df.dropna(subset=["price_per_sqft", "micromarketPriceAverage"])

    # Filter options derived from the unfiltered (but valid-row) dataset
    full_options = FilterOptions(
        cities=sorted(df["city"].dropna().unique().tolist()),
        developerGrades=[g for g in GRADE_ORDER if g in set(df["developerGrade"].dropna())],
        projectStatuses=sorted(df["projectStatus"].dropna().unique().tolist()),
        micromarkets=sorted(df["micromarket"].dropna().unique().tolist()),
    )

    if cities:
        df = df[df["city"].isin(cities)]
    if developer_grades:
        df = df[df["developerGrade"].isin(developer_grades)]
    if project_statuses:
        df = df[df["projectStatus"].isin(project_statuses)]

    # Derived columns (preserve the original 1-decimal rounding)
    df = df.assign(
        vs_market_pct=(
            (df["price_per_sqft"] - df["micromarketPriceAverage"])
            / df["micromarketPriceAverage"] * 100
        ).round(1),
        bubble_size=(
            df["popularity"].map(POPULARITY_BUBBLE).fillna(DEFAULT_BUBBLE).astype(int)
        ),
    )

    if show_only_underpriced:
        df = df[df["vs_market_pct"] < 0]

    if df.empty:
        return PriceVsMarketResponse(
            filterOptions=full_options,
            kpis=PriceVsMarketKPIs(
                count=0, avgPricePerSqft=None, belowMarketCount=0, medianVsMarketPct=None,
            ),
            scatter=[],
            axisRange=[0.0, 1.0],
            topUnderpriced=[],
            topOverpriced=[],
        )

    kpis = PriceVsMarketKPIs(
        count=int(len(df)),
        avgPricePerSqft=float(df["price_per_sqft"].mean()),
        belowMarketCount=int((df["vs_market_pct"] < 0).sum()),
        medianVsMarketPct=float(df["vs_market_pct"].median()),
    )

    axis_min = float(min(df["micromarketPriceAverage"].min(), df["price_per_sqft"].min()) * 0.9)
    axis_max = float(max(df["micromarketPriceAverage"].max(), df["price_per_sqft"].max()) * 1.05)

    scatter = [
        PriceVsMarketScatterPoint(
            id=int(r["id"]),
            name=r.get("name"),
            developerName=r.get("developerName"),
            developerGrade=r.get("developerGrade"),
            popularity=r.get("popularity"),
            city=r.get("city"),
            micromarket=r.get("micromarket"),
            projectStatus=r.get("projectStatus"),
            x=float(r["micromarketPriceAverage"]),
            y=float(r["price_per_sqft"]),
            vsMarketPct=float(r["vs_market_pct"]),
            bubbleSize=int(r["bubble_size"]),
        )
        for r in _records(df)
    ]

    def _to_outliers(sub: pd.DataFrame) -> list[PriceVsMarketOutlier]:
        return [
            PriceVsMarketOutlier(
                id=int(r["id"]),
                name=r.get("name"),
                developerName=r.get("developerName"),
                developerGrade=r.get("developerGrade"),
                micromarket=r.get("micromarket"),
                city=r.get("city"),
                pricePerSqft=float(r["price_per_sqft"]),
                micromarketPriceAverage=float(r["micromarketPriceAverage"]),
                vsMarketPct=float(r["vs_market_pct"]),
                projectStatus=r.get("projectStatus"),
            )
            for r in _records(sub)
        ]

    top_under = _to_outliers(df.nsmallest(TOP_N, "vs_market_pct"))
    top_over = _to_outliers(df.nlargest(TOP_N, "vs_market_pct"))

    return PriceVsMarketResponse(
        filterOptions=full_options,
        kpis=kpis,
        scatter=scatter,
        axisRange=[axis_min, axis_max],
        topUnderpriced=top_under,
        topOverpriced=top_over,
    )
