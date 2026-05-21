import { useEffect, useMemo, useState } from 'react';
import type { Data, Layout } from 'plotly.js';
import Plot from '../components/Plot';
import { MultiSelectFilter } from '../components/Filters';
import { fetchAmenityPremium } from '../lib/api';
import { useDebounced } from '../hooks/useDebounced';
import type {
  AmenityBoxData,
  AmenityMicromarketRow,
  AmenityPremiumResponse,
  AmenitySummaryRow,
} from '../types/api';

interface FormState {
  alpha: number;
  micromarket?: string[];
  developerGrade?: string[];
  projectStatus?: string[];
  drillAmenity?: string;
}

const DEFAULTS: FormState = {
  alpha: 0.05,
  projectStatus: ['available'],
};

function fmtPct(n: number, signed = true, decimals = 1): string {
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

function buildBarChart(rows: AmenitySummaryRow[]): { traces: Data[]; layout: Partial<Layout> } {
  const sig = rows.filter((r) => r.significant);
  const notSig = rows.filter((r) => !r.significant);

  const traces: Data[] = [
    {
      type: 'bar',
      name: 'Significant',
      x: sig.map((r) => r.label),
      y: sig.map((r) => r.premiumPct),
      marker: { color: '#2ecc71' },
      text: sig.map((r) => fmtPct(r.premiumPct, true, 1)),
      textposition: 'outside',
      hovertemplate: '<b>%{x}</b><br>Premium: %{y:+.1f}%<extra></extra>',
    },
    {
      type: 'bar',
      name: 'Not significant',
      x: notSig.map((r) => r.label),
      y: notSig.map((r) => r.premiumPct),
      marker: { color: '#bdc3c7' },
      text: notSig.map((r) => fmtPct(r.premiumPct, true, 1)),
      textposition: 'outside',
      hovertemplate: '<b>%{x}</b><br>Premium: %{y:+.1f}%<extra></extra>',
    },
  ];

  const layout: Partial<Layout> = {
    title: { text: 'Price premium by amenity' },
    yaxis: {
      title: { text: 'Price Premium (%)' },
      ticksuffix: '%',
      zeroline: true,
      zerolinecolor: 'black',
      zerolinewidth: 1,
      gridcolor: '#f0f0f0',
    },
    xaxis: { title: { text: 'Amenity' } },
    plot_bgcolor: 'white',
    paper_bgcolor: 'white',
    height: 380,
    margin: { l: 60, r: 20, t: 50, b: 60 },
    showlegend: true,
  };
  return { traces, layout };
}

function buildBoxChart(boxes: AmenityBoxData[]): { traces: Data[]; layout: Partial<Layout> } {
  // For each amenity, two box traces (with vs without)
  const traces: Data[] = [];
  for (const b of boxes) {
    traces.push({
      type: 'box',
      name: `With ${b.label}`,
      x: b.withPrices.map(() => b.label),
      y: b.withPrices,
      marker: { color: '#2ecc71' },
      legendgroup: 'with',
      showlegend: traces.length === 0,
    });
    traces.push({
      type: 'box',
      name: `Without ${b.label}`,
      x: b.withoutPrices.map(() => b.label),
      y: b.withoutPrices,
      marker: { color: '#bdc3c7' },
      legendgroup: 'without',
      showlegend: traces.length === 1,
    });
  }
  const layout: Partial<Layout> = {
    title: { text: 'Price distribution: with vs without' },
    yaxis: {
      title: { text: 'Price per sqft (₹)' },
      gridcolor: '#f0f0f0',
    },
    xaxis: { title: { text: 'Amenity' } },
    boxmode: 'group',
    plot_bgcolor: 'white',
    paper_bgcolor: 'white',
    height: 380,
    margin: { l: 60, r: 20, t: 50, b: 60 },
  };
  return { traces, layout };
}

function buildMicromarketChart(
  rows: AmenityMicromarketRow[],
  amenityLabel: string,
): { traces: Data[]; layout: Partial<Layout> } {
  const traces: Data[] = [
    {
      type: 'bar',
      x: rows.map((r) => r.micromarket),
      y: rows.map((r) => r.premiumPct),
      marker: {
        color: rows.map((r) => r.premiumPct),
        colorscale: [
          [0, '#e74c3c'],
          [0.5, '#f0f0f0'],
          [1, '#2ecc71'],
        ],
        cmin: -Math.max(...rows.map((r) => Math.abs(r.premiumPct)), 1),
        cmax: Math.max(...rows.map((r) => Math.abs(r.premiumPct)), 1),
      },
      text: rows.map((r) => fmtPct(r.premiumPct, true, 1)),
      textposition: 'outside',
      hovertemplate:
        '<b>%{x}</b><br>Premium: %{y:+.1f}%<br>n_with=%{customdata[0]}, n_without=%{customdata[1]}<extra></extra>',
      customdata: rows.map((r) => [r.nWith, r.nWithout]),
    },
  ];
  const layout: Partial<Layout> = {
    title: { text: `${amenityLabel} premium by micromarket` },
    yaxis: {
      title: { text: 'Premium (%)' },
      ticksuffix: '%',
      zeroline: true,
      zerolinecolor: 'black',
      zerolinewidth: 1,
      gridcolor: '#f0f0f0',
    },
    xaxis: {
      title: { text: 'Micromarket' },
      tickangle: -45,
    },
    plot_bgcolor: 'white',
    paper_bgcolor: 'white',
    height: 420,
    margin: { l: 60, r: 20, t: 50, b: 130 },
    showlegend: false,
  };
  return { traces, layout };
}

function SummaryTable({ rows }: { rows: AmenitySummaryRow[] }) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Amenity</th>
            <th className="num">N (with)</th>
            <th className="num">N (without)</th>
            <th className="num">Avg ₹/sqft (with)</th>
            <th className="num">Avg ₹/sqft (without)</th>
            <th className="num">Premium</th>
            <th className="num">t-statistic</th>
            <th className="num">p-value</th>
            <th>Significant</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.col}>
              <td>{r.label}</td>
              <td className="num">{r.nWith}</td>
              <td className="num">{r.nWithout}</td>
              <td className="num">₹{Math.round(r.meanWith).toLocaleString('en-IN')}</td>
              <td className="num">₹{Math.round(r.meanWithout).toLocaleString('en-IN')}</td>
              <td className="num">{fmtPct(r.premiumPct, true, 1)}</td>
              <td className="num">{r.tStat.toFixed(2)}</td>
              <td className="num">{r.pValue.toFixed(4)}</td>
              <td>{r.significant ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="filter-row">
      <label className="filter-label slider-label">
        <span>{label}</span>
        <span className="slider-value">{format ? format(value) : value}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="filter-slider"
      />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

export default function AmenityPremiumPage() {
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [data, setData] = useState<AmenityPremiumResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedForm = useDebounced(form, 200);

  useEffect(() => {
    let cancelled = false;
    fetchAmenityPremium(debouncedForm)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedForm]);

  const bar = useMemo(
    () => (data ? buildBarChart(data.summary) : null),
    [data],
  );
  const box = useMemo(
    () => (data ? buildBoxChart(data.boxData) : null),
    [data],
  );
  const drillChart = useMemo(() => {
    if (!data || !data.drillAmenity || data.micromarketBreakdown.length === 0) return null;
    const label = data.summary.find((s) => s.col === data.drillAmenity)?.label ?? data.drillAmenity;
    return buildMicromarketChart(data.micromarketBreakdown, label);
  }, [data]);

  const sigCount = data?.summary.filter((r) => r.significant).length ?? 0;
  const top = data?.summary[0];

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <h1>Amenity Premium</h1>
        <p className="dashboard-caption">
          Which amenities actually command a price premium vs which are just marketing?
        </p>
      </header>

      {error && <div className="error-banner">Error: {error}</div>}

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <h2>Filters</h2>
          {data && (
            <>
              <div className="filter-row">
                <label className="filter-label">Micromarket</label>
                <MultiSelectFilter
                  options={data.filterOptions.micromarkets}
                  value={form.micromarket}
                  onChange={(v) =>
                    setForm((s) => ({ ...s, micromarket: v ?? undefined }))
                  }
                />
              </div>
              <div className="filter-row">
                <label className="filter-label">Developer Grade</label>
                <MultiSelectFilter
                  options={data.filterOptions.developerGrades}
                  value={form.developerGrade}
                  onChange={(v) =>
                    setForm((s) => ({ ...s, developerGrade: v ?? undefined }))
                  }
                />
              </div>
              <div className="filter-row">
                <label className="filter-label">Project Status</label>
                <MultiSelectFilter
                  options={data.filterOptions.projectStatuses}
                  value={form.projectStatus}
                  onChange={(v) =>
                    setForm((s) => ({ ...s, projectStatus: v ?? undefined }))
                  }
                />
              </div>
            </>
          )}
          <Slider
            label="Significance level (α)"
            min={0.01}
            max={0.20}
            step={0.01}
            value={form.alpha}
            onChange={(v) => setForm((s) => ({ ...s, alpha: v }))}
            format={(v) => v.toFixed(2)}
          />
        </aside>

        <section className="dashboard-main">
          {loading && !data ? (
            <p className="dashboard-placeholder">Loading...</p>
          ) : data && data.summary.length === 0 ? (
            <p className="dashboard-placeholder">
              Not enough data to analyze amenity premiums with current filters. Broaden your
              selection.
            </p>
          ) : data && bar && box ? (
            <>
              <div className="kpi-row">
                <Kpi label="Projects analyzed" value={String(data.projectsAnalyzed)} />
                <Kpi label="Amenities tested" value={String(data.summary.length)} />
                <Kpi label="Statistically significant" value={String(sigCount)} />
                <Kpi
                  label="Highest premium"
                  value={top ? `${top.label}: ${fmtPct(top.premiumPct, true, 1)}` : '—'}
                />
              </div>

              <div className="dashboard-split">
                <div className="chart-card chart-card-grow">
                  <Plot data={bar.traces} layout={bar.layout} />
                  <p className="chart-caption">
                    Green = statistically significant at α={data.alpha.toFixed(2)}. Premium = %
                    difference in avg ₹/sqft between projects with vs without the amenity.
                  </p>
                </div>
                <div className="chart-card chart-card-grow">
                  <Plot data={box.traces} layout={box.layout} />
                  <p className="chart-caption">
                    Box plots show median, quartiles, and outliers for each group.
                  </p>
                </div>
              </div>

              <h2 className="dashboard-subhead">Statistical summary</h2>
              <SummaryTable rows={data.summary} />

              <h2 className="dashboard-subhead" style={{ marginTop: 18 }}>
                Amenity premium by micromarket
              </h2>
              <p className="dashboard-caption">
                Does the premium hold across locations, or is it driven by a few expensive
                micromarkets?
              </p>
              <div className="filter-row" style={{ maxWidth: 320, margin: '8px 0 12px' }}>
                <label className="filter-label">Drill into amenity</label>
                <select
                  className="filter-input"
                  value={form.drillAmenity ?? data.drillAmenity ?? ''}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, drillAmenity: e.target.value || undefined }))
                  }
                >
                  {data.summary.map((r) => (
                    <option key={r.col} value={r.col}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              {drillChart ? (
                <div className="chart-card">
                  <Plot data={drillChart.traces} layout={drillChart.layout} />
                  <p className="chart-caption">
                    Micromarkets with only 1–2 projects per group should be interpreted cautiously.
                  </p>
                </div>
              ) : (
                <p className="dashboard-placeholder">
                  Not enough micromarket-level data for this amenity.
                </p>
              )}

              <details className="methodology-details">
                <summary>Methodology</summary>
                <div>
                  <p>
                    <strong>Metric:</strong> minPrice / minSaleableArea (₹ per sqft).
                  </p>
                  <p>
                    <strong>Test:</strong> Welch&apos;s t-test (unequal variance) comparing
                    projects with vs without each amenity.
                  </p>
                  <p>
                    <strong>Significance level:</strong> α = {data.alpha.toFixed(2)}
                  </p>
                  <p>
                    <strong>Caveat:</strong> Correlation ≠ causation. Premium amenities tend to
                    appear in premium projects. The micromarket breakdown helps disentangle
                    location effects.
                  </p>
                </div>
              </details>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
