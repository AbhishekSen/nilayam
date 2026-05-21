export type FilterType =
  | 'text'
  | 'multiSelect'
  | 'multiTypology'
  | 'boolean'
  | 'range'
  | 'dateRange';

interface BaseFilter {
  field: string;
  label: string;
  type: FilterType;
}

export interface TextFilterDef extends BaseFilter {
  type: 'text';
}

export interface MultiSelectFilterDef extends BaseFilter {
  type: 'multiSelect';
  options: string[];
}

export interface MultiTypologyFilterDef extends BaseFilter {
  type: 'multiTypology';
  options: string[];
}

export interface BooleanFilterDef extends BaseFilter {
  type: 'boolean';
}

export interface RangeFilterDef extends BaseFilter {
  type: 'range';
  min: number;
  max: number;
  step: number;
}

export interface DateRangeFilterDef extends BaseFilter {
  type: 'dateRange';
}

export type FilterDef =
  | TextFilterDef
  | MultiSelectFilterDef
  | MultiTypologyFilterDef
  | BooleanFilterDef
  | RangeFilterDef
  | DateRangeFilterDef;

export type FilterSchema = FilterDef[];

export type RangeValue = { min: number | null; max: number | null };
export type DateRangeValue = { from: string | null; to: string | null };
export type BooleanValue = 'yes' | 'no';

export type FilterValue =
  | string
  | string[]
  | RangeValue
  | DateRangeValue
  | BooleanValue;

export type FilterState = Record<string, FilterValue | undefined>;
