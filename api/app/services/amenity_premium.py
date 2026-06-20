"""Port of analytics/pages/3_Amenity_Premium.py — keeps scipy.stats.ttest_ind."""
from __future__ import annotations

from typing import Optional

import pandas as pd
from scipy import stats

from api.app.models import (
    AmenityBoxData,
    AmenityMicromarketRow,
    AmenityPremiumResponse,
    AmenitySummaryRow,
    FilterOptions,
)
from api.app.services.data import load_projects_df

AMENITIES: dict[str, str] = {
    "petPark": "Pet Park",
    "squash": "Squash Court",
    "pharmacy": "Pharmacy",
    "basketball": "Basketball Court",
    "heatedPool": "Heated Pool",
}


def compute(
    alpha: float = 0.05,
    micromarkets: Optional[list[str]] = None,
    developer_grades: Optional[list[str]] = None,
    project_statuses: Optional[list[str]] = None,
    drill_amenity: Optional[str] = None,
) -> AmenityPremiumResponse:
    df = load_projects_df()
    df = df.dropna(subset=["price_per_sqft"])

    full_options = FilterOptions(
        cities=sorted(df["city"].dropna().unique().tolist()),
        developerGrades=sorted(df["developerGrade"].dropna().unique().tolist()),
        projectStatuses=sorted(df["projectStatus"].dropna().unique().tolist()),
        micromarkets=sorted(df["micromarket"].dropna().unique().tolist()),
    )

    if micromarkets:
        df = df[df["micromarket"].isin(micromarkets)]
    if developer_grades:
        df = df[df["developerGrade"].isin(developer_grades)]
    if project_statuses:
        df = df[df["projectStatus"].isin(project_statuses)]

    if len(df) < 5:
        return AmenityPremiumResponse(
            filterOptions=full_options,
            alpha=alpha,
            projectsAnalyzed=int(len(df)),
            summary=[],
            boxData=[],
            drillAmenity=None,
            micromarketBreakdown=[],
        )

    summary: list[AmenitySummaryRow] = []
    box_data: list[AmenityBoxData] = []
    for col, label in AMENITIES.items():
        if col not in df.columns:
            continue
        with_a = df.loc[df[col] == 1, "price_per_sqft"].dropna()
        without_a = df.loc[df[col] == 0, "price_per_sqft"].dropna()
        if len(with_a) < 2 or len(without_a) < 2:
            continue

        mean_with = float(with_a.mean())
        mean_without = float(without_a.mean())
        premium_pct = ((mean_with - mean_without) / mean_without) * 100
        t_stat, p_value = stats.ttest_ind(with_a, without_a, equal_var=False)

        summary.append(
            AmenitySummaryRow(
                col=col,
                label=label,
                nWith=int(len(with_a)),
                nWithout=int(len(without_a)),
                meanWith=mean_with,
                meanWithout=mean_without,
                premiumPct=float(premium_pct),
                tStat=float(t_stat),
                pValue=float(p_value),
                significant=bool(p_value < alpha),
            )
        )
        box_data.append(
            AmenityBoxData(
                col=col,
                label=label,
                withPrices=[float(x) for x in with_a.tolist()],
                withoutPrices=[float(x) for x in without_a.tolist()],
            )
        )

    summary.sort(key=lambda r: r.premiumPct, reverse=True)

    # Drill: default to highest-premium amenity unless specified
    drill = drill_amenity
    if drill and drill not in {r.col for r in summary}:
        drill = None
    if not drill and summary:
        drill = summary[0].col

    micromarket_breakdown: list[AmenityMicromarketRow] = []
    if drill and drill in df.columns:
        for mm in df["micromarket"].dropna().unique():
            mm_data = df[df["micromarket"] == mm]
            with_m = mm_data.loc[mm_data[drill] == 1, "price_per_sqft"].dropna()
            without_m = mm_data.loc[mm_data[drill] == 0, "price_per_sqft"].dropna()
            if len(with_m) >= 1 and len(without_m) >= 1:
                avg_with = float(with_m.mean())
                avg_without = float(without_m.mean())
                premium = ((avg_with - avg_without) / avg_without) * 100
                micromarket_breakdown.append(
                    AmenityMicromarketRow(
                        micromarket=str(mm),
                        nWith=int(len(with_m)),
                        nWithout=int(len(without_m)),
                        avgWith=avg_with,
                        avgWithout=avg_without,
                        premiumPct=float(premium),
                    )
                )
        micromarket_breakdown.sort(key=lambda r: r.premiumPct, reverse=True)

    return AmenityPremiumResponse(
        filterOptions=full_options,
        alpha=alpha,
        projectsAnalyzed=int(len(df)),
        summary=summary,
        boxData=box_data,
        drillAmenity=drill,
        micromarketBreakdown=micromarket_breakdown,
    )
