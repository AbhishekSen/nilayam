from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from api.app.models import (
    AmenityPremiumResponse,
    PriceVsMarketResponse,
    UndervaluedResponse,
)
from api.app.services import amenity_premium, price_vs_market, undervalued

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/price-vs-market", response_model=PriceVsMarketResponse)
def price_vs_market_route(
    city: Optional[list[str]] = Query(default=None),
    developerGrade: Optional[list[str]] = Query(default=None),
    projectStatus: Optional[list[str]] = Query(default=None),
    showOnlyUnderpriced: bool = Query(default=False),
) -> PriceVsMarketResponse:
    return price_vs_market.compute(
        cities=city,
        developer_grades=developerGrade,
        project_statuses=projectStatus,
        show_only_underpriced=showOnlyUnderpriced,
    )


@router.get("/undervalued", response_model=UndervaluedResponse)
def undervalued_route(
    minDiscount: float = Query(default=5.0, ge=0.0, le=100.0),
    minPropscore: float = Query(default=2.5, ge=0.0, le=5.0),
    developerGrade: Optional[list[str]] = Query(default=None),
    projectStatus: Optional[list[str]] = Query(default=None),
    micromarket: Optional[list[str]] = Query(default=None),
    wDiscount: float = Query(default=0.40, ge=0.0, le=1.0),
    wPropscore: float = Query(default=0.35, ge=0.0, le=1.0),
    wGrade: float = Query(default=0.25, ge=0.0, le=1.0),
) -> UndervaluedResponse:
    return undervalued.compute(
        min_discount=minDiscount,
        min_propscore=minPropscore,
        developer_grades=developerGrade,
        project_statuses=projectStatus,
        micromarkets=micromarket,
        w_discount=wDiscount,
        w_propscore=wPropscore,
        w_grade=wGrade,
    )


@router.get("/amenity-premium", response_model=AmenityPremiumResponse)
def amenity_premium_route(
    alpha: float = Query(default=0.05, ge=0.001, le=0.5),
    micromarket: Optional[list[str]] = Query(default=None),
    developerGrade: Optional[list[str]] = Query(default=None),
    projectStatus: Optional[list[str]] = Query(default=None),
    drillAmenity: Optional[str] = Query(default=None),
) -> AmenityPremiumResponse:
    return amenity_premium.compute(
        alpha=alpha,
        micromarkets=micromarket,
        developer_grades=developerGrade,
        project_statuses=projectStatus,
        drill_amenity=drillAmenity,
    )
