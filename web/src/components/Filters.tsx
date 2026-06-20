import { useState, useRef, useEffect } from 'react';
import type { BooleanValue, DateRangeValue, FilterValue, RangeValue } from '../types/filters';

type Setter<T extends FilterValue> = (v: T | null) => void;

export function TextFilter({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: Setter<string>;
}) {
  return (
    <input
      type="search"
      className="filter-input"
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder="Search..."
    />
  );
}

export function MultiSelectFilter({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[] | undefined;
  onChange: Setter<string[]>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = value || [];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function toggle(opt: string) {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    onChange(next.length ? next : null);
  }

  const filtered = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  const summary = selected.length === 0
    ? 'Any'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <div className="multiselect" ref={ref}>
      <button
        type="button"
        className="multiselect-toggle"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="multiselect-summary">{summary}</span>
        <span className="multiselect-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="multiselect-panel">
          {options.length > 8 && (
            <input
              type="search"
              className="filter-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search options..."
            />
          )}
          <div className="multiselect-list">
            {filtered.length === 0 && (
              <p className="multiselect-empty">No matches</p>
            )}
            {filtered.map((opt) => (
              <label key={opt} className="multiselect-option">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RangeFilter({
  min,
  max,
  step,
  value,
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  value: RangeValue | undefined;
  onChange: Setter<RangeValue>;
}) {
  const v: Partial<RangeValue> = value || {};

  function update(key: 'min' | 'max', raw: string) {
    const n = raw === '' ? null : Number(raw);
    const next: RangeValue = {
      min: key === 'min' ? n : (v.min ?? null),
      max: key === 'max' ? n : (v.max ?? null),
    };
    onChange(next.min == null && next.max == null ? null : next);
  }

  return (
    <div className="range-filter">
      <input
        type="number"
        className="filter-input"
        placeholder={`Min (${min})`}
        value={v.min ?? ''}
        step={step}
        onChange={(e) => update('min', e.target.value)}
      />
      <input
        type="number"
        className="filter-input"
        placeholder={`Max (${max})`}
        value={v.max ?? ''}
        step={step}
        onChange={(e) => update('max', e.target.value)}
      />
    </div>
  );
}

export function BooleanFilter({
  value,
  onChange,
}: {
  value: BooleanValue | undefined;
  onChange: Setter<BooleanValue>;
}) {
  return (
    <select
      className="filter-input"
      value={value || 'any'}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === 'any' ? null : (v as BooleanValue));
      }}
    >
      <option value="any">Any</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRangeValue | undefined;
  onChange: Setter<DateRangeValue>;
}) {
  const v: Partial<DateRangeValue> = value || {};

  function update(key: 'from' | 'to', raw: string) {
    const next: DateRangeValue = {
      from: key === 'from' ? (raw || null) : (v.from ?? null),
      to: key === 'to' ? (raw || null) : (v.to ?? null),
    };
    onChange(!next.from && !next.to ? null : next);
  }

  return (
    <div className="range-filter">
      <input
        type="date"
        className="filter-input"
        value={v.from || ''}
        onChange={(e) => update('from', e.target.value)}
      />
      <input
        type="date"
        className="filter-input"
        value={v.to || ''}
        onChange={(e) => update('to', e.target.value)}
      />
    </div>
  );
}
