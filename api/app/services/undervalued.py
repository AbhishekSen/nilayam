"""Port of analytics/pages/2_Undervalued.py — opportunity scoring."""
from __future__ import annotations

from typing import Optional

import pandas as pd

from api.app.models import (
    FilterOptions,
    UndervaluedCandidate,
    UndervaluedKPIs,
    UndervaluedMicromarketRow,
    UndervaluedResponse,
    UndervaluedScatterPoint,
    UndervaluedThresholds,
)
from api.app.services.data import load_projects_df

GRADE_ORDER = ["A", "B", "C", "D", "G"]
GRADE_SCORE = {"A": 5, "B": 4, "C": 3, "D": 2, "G": 1}


def _records(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []
    return df.where(df.notna(), None).to_dict(orient="records")


def _min_max(series: pd.Series) -> pd.Series:
    rng = series.max() - series.min()
    if not rng or pd.isna(rng):
        return series * 0
    return (series - series.min()) / rng


def compute(
    min_discount: float = 5.0,
    min_propscore: float = 2.5,
    developer_grades: Optional[list[str]] = None,
    project_statuses: Optional[list[str]] = None,
    micromarkets: Optional[list[str]] = None,
    w_discount: float = 0.40,
    w_propscore: float = 0.35,
    w_grade: float = 0.25,
) -> UndervaluedResponse:
    df = load_projects_df()
    df = df.dropna(subset=["price_per_sqft", "micromarketPriceAverage"])

    # Derived columns (computed on FULL data, before filtering — matches Streamlit behavior)
    df = df.assign(
        discount_pct=(
            (df["micromarketPriceAverage"] - df["price_per_sqft"])
            / df["micromarketPriceAverage"] * 100
        ).round(2),
        grade_score=df["developerGrade"].map(GRADE_SCORE).fillna(1),
    )
    df["norm_discount"] = _min_max(df["discount_pct"].clip(lower=0))
    df["norm_propscore"] = _min_max(df["propscore"])
    df["norm_grade"] = _min_max(df["grade_score"])

    total_w = w_discount + w_propscore + w_grade
    if total_w <= 0:
        # Degenerate: zero weights → all candidates score 0
        df["opportunity_score"] = 0.0
    else:
        df["opportunity_score"] = (
            (w_discount / total_w) * df["norm_discount"]
            + (w_propscore / total_w) * df["norm_propscore"]
            + (w_grade / total_w) * df["norm_grade"]
        ).round(3)

    # Filter options derived from full (valid-row) dataset
    full_options = FilterOptions(
        cities=sorted(df["city"].dropna().unique().tolist()),
        developerGrades=[g for g in GRADE_ORDER if g in set(df["developerGrade"].dropna())],
        projectStatuses=sorted(df["projectStatus"].dropna().unique().tolist()),
        micromarkets=sorted(df["micromarket"].dropna().unique().tolist()),
    )

    # Apply filters
    mask = (
        (df["discount_pct"] >= min_discount)
        & (df["propscore"] >= min_propscore)
    )
    if developer_grades:
        mask &= df["developerGrade"].isin(developer_grades)
    if project_statuses:
        mask &= df["projectStatus"].isin(project_statuses)
    if micromarkets:
        mask &= df["micromarket"].isin(micromarkets)

    fdf = df[mask].sort_values("opportunity_score", ascending=False).copy()

    thresholds = UndervaluedThresholds(minDiscount=min_discount, minPropscore=min_propscore)

    if fdf.empty:
        return UndervaluedResponse(
            filterOptions=full_options,
            thresholds=thresholds,
            kpis=UndervaluedKPIs(
                candidates=0, avgDiscount=None, maxDiscount=None,
                avgPropscore=None, gradeABCount=0,
            ),
            scatter=[],
            candidates=[],
            micromarketBreakdown=[],
        )

    kpis = UndervaluedKPIs(
        candidates=int(len(fdf)),
        avgDiscount=float(fdf["discount_pct"].mean()),
        maxDiscount=float(fdf["discount_pct"].max()),
        avgPropscore=float(fdf["propscore"].mean()) if not fdf["propscore"].isna().all() else None,
        gradeABCount=int(fdf["developerGrade"].isin(["A", "B"]).sum()),
    )

    scatter = [
        UndervaluedScatterPoint(
            id=int(r["id"]),
            name=r.get("name"),
            developerName=r.get("developerName"),
            developerGrade=r.get("developerGrade"),
            micromarket=r.get("micromarket"),
            projectStatus=r.get("projectStatus"),
            x=float(r["discount_pct"]),
            y=float(r["propscore"]) if r.get("propscore") is not None else 0.0,
            opportunityScore=float(r["opportunity_score"]) if r.get("opportunity_score") is not None else 0.0,
            pricePerSqft=r.get("price_per_sqft"),
            micromarketPriceAverage=r.get("micromarketPriceAverage"),
        )
        for r in _records(fdf)
        if r.get("propscore") is not None
    ]

    def _iso(v):
        if v is None:
            return None
        if isinstance(v, str):
            return v
        try:
            return pd.Timestamp(v).isoformat()
        except (ValueError, TypeError):
            return None

    candidates = [
        UndervaluedCandidate(
            id=int(r["id"]),
            name=r.get("name"),
            developerName=r.get("developerName"),
            developerGrade=r.get("developerGrade"),
            micromarket=r.get("micromarket"),
            pricePerSqft=float(r["price_per_sqft"]),
            micromarketPriceAverage=float(r["micromarketPriceAverage"]),
            discountPct=float(r["discount_pct"]),
            propscore=r.get("propscore"),
            opportunityScore=float(r["opportunity_score"]) if r.get("opportunity_score") is not None else 0.0,
            projectStatus=r.get("projectStatus"),
            possessionDate=_iso(r.get("possessionDate")),
        )
        for r in _records(fdf)
    ]

    # Micromarket breakdown
    grouped = (
        fdf.groupby("micromarket", dropna=True)
        .agg(
            candidates=("id", "count"),
            avg_discount=("discount_pct", "mean"),
            avg_propscore=("propscore", "mean"),
            avg_opp_score=("opportunity_score", "mean"),
        )
        .sort_values("avg_opp_score", ascending=False)
        .reset_index()
    )
    micromarket_breakdown = [
        UndervaluedMicromarketRow(
            micromarket=str(r["micromarket"]),
            candidates=int(r["candidates"]),
            avgDiscount=float(r["avg_discount"]),
            avgPropscore=float(r["avg_propscore"]) if pd.notna(r["avg_propscore"]) else None,
            avgOppScore=float(r["avg_opp_score"]),
        )
        for r in _records(grouped)
    ]

    return UndervaluedResponse(
        filterOptions=full_options,
        thresholds=thresholds,
        kpis=kpis,
        scatter=scatter,
        candidates=candidates,
        micromarketBreakdown=micromarket_breakdown,
    )
