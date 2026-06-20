import {
  TextFilter,
  MultiSelectFilter,
  RangeFilter,
  BooleanFilter,
  DateRangeFilter,
} from './Filters';
import type { FilterDef, FilterSchema, FilterState, FilterValue } from '../types/filters';

interface Props {
  schema: FilterSchema;
  state: FilterState;
  onChange: (next: FilterState) => void;
  totalCount: number;
  filteredCount: number;
}

function FilterControl({
  def,
  value,
  onChange,
}: {
  def: FilterDef;
  value: FilterValue | undefined;
  onChange: (v: FilterValue | null) => void;
}) {
  switch (def.type) {
    case 'text':
      return <TextFilter value={value as string | undefined} onChange={onChange} />;
    case 'multiSelect':
    case 'multiTypology':
      return (
        <MultiSelectFilter
          options={def.options}
          value={value as string[] | undefined}
          onChange={onChange}
        />
      );
    case 'range':
      return (
        <RangeFilter
          min={def.min}
          max={def.max}
          step={def.step}
          value={value as { min: number | null; max: number | null } | undefined}
          onChange={onChange}
        />
      );
    case 'boolean':
      return <BooleanFilter value={value as 'yes' | 'no' | undefined} onChange={onChange} />;
    case 'dateRange':
      return (
        <DateRangeFilter
          value={value as { from: string | null; to: string | null } | undefined}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

export default function FilterPanel({
  schema,
  state,
  onChange,
  totalCount,
  filteredCount,
}: Props) {
  function update(field: string, val: FilterValue | null) {
    const next: FilterState = { ...state };
    if (val === null || val === undefined) delete next[field];
    else next[field] = val;
    onChange(next);
  }

  const hasActive = Object.keys(state).length > 0;

  return (
    <aside className="filter-panel">
      <header className="filter-panel-header">
        <h2>Filters</h2>
        <button
          type="button"
          className="filter-clear"
          onClick={() => onChange({})}
          disabled={!hasActive}
        >
          Clear
        </button>
      </header>
      <p className="filter-count">
        <strong>{filteredCount}</strong> of {totalCount} properties
      </p>
      <div className="filter-list">
        {schema.map((f) => (
          <div key={f.field} className="filter-row">
            <label className="filter-label">{f.label}</label>
            <FilterControl
              def={f}
              value={state[f.field]}
              onChange={(v) => update(f.field, v)}
            />
          </div>
        ))}
      </div>
    </aside>
  );
}
