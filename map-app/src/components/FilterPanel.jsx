import {
  TextFilter,
  MultiSelectFilter,
  RangeFilter,
  BooleanFilter,
  DateRangeFilter,
} from './Filters';

const COMPONENTS = {
  text: TextFilter,
  multiSelect: MultiSelectFilter,
  multiTypology: MultiSelectFilter,
  range: RangeFilter,
  boolean: BooleanFilter,
  dateRange: DateRangeFilter,
};

export default function FilterPanel({
  schema,
  state,
  onChange,
  totalCount,
  filteredCount,
}) {
  function update(field, val) {
    const next = { ...state };
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
        {schema.map((f) => {
          const C = COMPONENTS[f.type];
          if (!C) return null;
          return (
            <div key={f.field} className="filter-row">
              <label className="filter-label">{f.label}</label>
              <C
                {...f}
                value={state[f.field]}
                onChange={(v) => update(f.field, v)}
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
}
