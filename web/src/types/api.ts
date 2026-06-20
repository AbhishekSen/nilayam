// Mirrors api/app/models.py:PropertySummary. Keep these in sync; if codegen
// is added later (Phase 8) this file becomes generated output.

export interface Property {
  id: number;
  name: string | null;
  slug: string | null;
  image: string | null;
  alt: string | null;
  latitude: number | null;
  longitude: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  minSaleableArea: number | null;
  maxSaleableArea: number | null;
  price_per_sqft: number | null;
  developerName: string | null;
  developerGrade: string | null;
  projectStatus: string | null;
  possessionDate: string | null; // ISO 8601
  propscore: number | null;
  popularity: string | null;
  city: string | null;
  micromarket: string | null;
  micromarketPriceAverage: number | null;
  typologies: string[] | null;
  landArea: number | null;
  unitDensity: number | null;
  metroProximity: number | null;
  petPark: number | null;
  squash: number | null;
  pharmacy: number | null;
  basketball: number | null;
  heatedPool: number | null;
}

// Property after coordinate validation: lat/lng are guaranteed numbers.
export type ValidatedProperty = Property & {
  latitude: number;
  longitude: number;
};

// --- Analytics responses ---

export interface FilterOptions {
  cities: string[];
  developerGrades: string[];
  projectStatuses: string[];
  micromarkets: string[];
}

// Price vs Market

export interface PriceVsMarketKPIs {
  count: number;
  avgPricePerSqft: number | null;
  belowMarketCount: number;
  medianVsMarketPct: number | null;
}

export interface PriceVsMarketScatterPoint {
  id: number;
  name: string | null;
  developerName: string | null;
  developerGrade: string | null;
  popularity: string | null;
  city: string | null;
  micromarket: string | null;
  projectStatus: string | null;
  x: number;
  y: number;
  vsMarketPct: number;
  bubbleSize: number;
}

export interface PriceVsMarketOutlier {
  id: number;
  name: string | null;
  developerName: string | null;
  developerGrade: string | null;
  micromarket: string | null;
  city: string | null;
  pricePerSqft: number;
  micromarketPriceAverage: number;
  vsMarketPct: number;
  projectStatus: string | null;
}

export interface PriceVsMarketResponse {
  filterOptions: FilterOptions;
  kpis: PriceVsMarketKPIs;
  scatter: PriceVsMarketScatterPoint[];
  axisRange: [number, number];
  topUnderpriced: PriceVsMarketOutlier[];
  topOverpriced: PriceVsMarketOutlier[];
}

// Undervalued

export interface UndervaluedKPIs {
  candidates: number;
  avgDiscount: number | null;
  maxDiscount: number | null;
  avgPropscore: number | null;
  gradeABCount: number;
}

export interface UndervaluedScatterPoint {
  id: number;
  name: string | null;
  developerName: string | null;
  developerGrade: string | null;
  micromarket: string | null;
  projectStatus: string | null;
  x: number;
  y: number;
  opportunityScore: number;
  pricePerSqft: number | null;
  micromarketPriceAverage: number | null;
}

export interface UndervaluedCandidate {
  id: number;
  name: string | null;
  developerName: string | null;
  developerGrade: string | null;
  micromarket: string | null;
  pricePerSqft: number;
  micromarketPriceAverage: number;
  discountPct: number;
  propscore: number | null;
  opportunityScore: number;
  projectStatus: string | null;
  possessionDate: string | null;
}

export interface UndervaluedMicromarketRow {
  micromarket: string;
  candidates: number;
  avgDiscount: number;
  avgPropscore: number | null;
  avgOppScore: number;
}

export interface UndervaluedThresholds {
  minDiscount: number;
  minPropscore: number;
}

export interface UndervaluedResponse {
  filterOptions: FilterOptions;
  thresholds: UndervaluedThresholds;
  kpis: UndervaluedKPIs;
  scatter: UndervaluedScatterPoint[];
  candidates: UndervaluedCandidate[];
  micromarketBreakdown: UndervaluedMicromarketRow[];
}

// Amenity Premium

export interface AmenitySummaryRow {
  col: string;
  label: string;
  nWith: number;
  nWithout: number;
  meanWith: number;
  meanWithout: number;
  premiumPct: number;
  tStat: number;
  pValue: number;
  significant: boolean;
}

export interface AmenityBoxData {
  col: string;
  label: string;
  withPrices: number[];
  withoutPrices: number[];
}

export interface AmenityMicromarketRow {
  micromarket: string;
  nWith: number;
  nWithout: number;
  avgWith: number;
  avgWithout: number;
  premiumPct: number;
}

export interface AmenityPremiumResponse {
  filterOptions: FilterOptions;
  alpha: number;
  projectsAnalyzed: number;
  summary: AmenitySummaryRow[];
  boxData: AmenityBoxData[];
  drillAmenity: string | null;
  micromarketBreakdown: AmenityMicromarketRow[];
}
