"""Pydantic response models. Only declared fields are exposed to the browser."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PropertySummary(BaseModel):
    """Whitelisted property row. Adding a column to projects_blr does NOT make it
    visible to the frontend until it's added here on purpose."""

    model_config = ConfigDict(extra="ignore")

    # Identifiers / display
    id: int
    name: Optional[str] = None
    slug: Optional[str] = None
    image: Optional[str] = None
    alt: Optional[str] = None

    # Geo
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # Price + area
    minPrice: Optional[float] = None
    maxPrice: Optional[float] = None
    minSaleableArea: Optional[float] = None
    maxSaleableArea: Optional[float] = None
    price_per_sqft: Optional[float] = None

    # Developer / status / timing
    developerName: Optional[str] = None
    developerGrade: Optional[str] = None
    projectStatus: Optional[str] = None
    possessionDate: Optional[datetime] = None

    # Scoring / categorical
    propscore: Optional[float] = None
    popularity: Optional[str] = None

    # Location categorization
    city: Optional[str] = None
    micromarket: Optional[str] = None
    micromarketPriceAverage: Optional[float] = None

    # Property attributes
    typologies: Optional[list[str]] = None
    landArea: Optional[float] = None
    unitDensity: Optional[float] = None
    metroProximity: Optional[float] = None

    # Amenity flags
    petPark: Optional[int] = None
    squash: Optional[int] = None
    pharmacy: Optional[int] = None
    basketball: Optional[int] = None
    heatedPool: Optional[int] = None


# --- Analytics responses ---

class FilterOptions(BaseModel):
    cities: list[str]
    developerGrades: list[str]
    projectStatuses: list[str]
    micromarkets: list[str]


# Price vs Market

class PriceVsMarketKPIs(BaseModel):
    count: int
    avgPricePerSqft: Optional[float]
    belowMarketCount: int
    medianVsMarketPct: Optional[float]


class PriceVsMarketScatterPoint(BaseModel):
    id: int
    name: Optional[str] = None
    developerName: Optional[str] = None
    developerGrade: Optional[str] = None
    popularity: Optional[str] = None
    city: Optional[str] = None
    micromarket: Optional[str] = None
    projectStatus: Optional[str] = None
    x: float
    y: float
    vsMarketPct: float
    bubbleSize: int


class PriceVsMarketOutlier(BaseModel):
    id: int
    name: Optional[str] = None
    developerName: Optional[str] = None
    developerGrade: Optional[str] = None
    micromarket: Optional[str] = None
    city: Optional[str] = None
    pricePerSqft: float
    micromarketPriceAverage: float
    vsMarketPct: float
    projectStatus: Optional[str] = None


class PriceVsMarketResponse(BaseModel):
    filterOptions: FilterOptions
    kpis: PriceVsMarketKPIs
    scatter: list[PriceVsMarketScatterPoint]
    axisRange: list[float]  # [min, max]
    topUnderpriced: list[PriceVsMarketOutlier]
    topOverpriced: list[PriceVsMarketOutlier]


# Undervalued

class UndervaluedKPIs(BaseModel):
    candidates: int
    avgDiscount: Optional[float]
    maxDiscount: Optional[float]
    avgPropscore: Optional[float]
    gradeABCount: int


class UndervaluedScatterPoint(BaseModel):
    id: int
    name: Optional[str] = None
    developerName: Optional[str] = None
    developerGrade: Optional[str] = None
    micromarket: Optional[str] = None
    projectStatus: Optional[str] = None
    x: float  # discount_pct
    y: float  # propscore
    opportunityScore: float
    pricePerSqft: Optional[float] = None
    micromarketPriceAverage: Optional[float] = None


class UndervaluedCandidate(BaseModel):
    id: int
    name: Optional[str] = None
    developerName: Optional[str] = None
    developerGrade: Optional[str] = None
    micromarket: Optional[str] = None
    pricePerSqft: float
    micromarketPriceAverage: float
    discountPct: float
    propscore: Optional[float] = None
    opportunityScore: float
    projectStatus: Optional[str] = None
    possessionDate: Optional[str] = None  # ISO 8601


class UndervaluedMicromarketRow(BaseModel):
    micromarket: str
    candidates: int
    avgDiscount: float
    avgPropscore: Optional[float]
    avgOppScore: float


class UndervaluedThresholds(BaseModel):
    minDiscount: float
    minPropscore: float


class UndervaluedResponse(BaseModel):
    filterOptions: FilterOptions
    thresholds: UndervaluedThresholds
    kpis: UndervaluedKPIs
    scatter: list[UndervaluedScatterPoint]
    candidates: list[UndervaluedCandidate]
    micromarketBreakdown: list[UndervaluedMicromarketRow]


# Amenity Premium

class AmenitySummaryRow(BaseModel):
    col: str  # database column name (petPark, squash, etc.)
    label: str  # display label
    nWith: int
    nWithout: int
    meanWith: float
    meanWithout: float
    premiumPct: float
    tStat: float
    pValue: float
    significant: bool


class AmenityBoxData(BaseModel):
    col: str
    label: str
    withPrices: list[float]
    withoutPrices: list[float]


class AmenityMicromarketRow(BaseModel):
    micromarket: str
    nWith: int
    nWithout: int
    avgWith: float
    avgWithout: float
    premiumPct: float


class AmenityPremiumResponse(BaseModel):
    filterOptions: FilterOptions
    alpha: float
    projectsAnalyzed: int
    summary: list[AmenitySummaryRow]
    boxData: list[AmenityBoxData]
    drillAmenity: Optional[str]
    micromarketBreakdown: list[AmenityMicromarketRow]
