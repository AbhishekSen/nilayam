import { useEffect, useMemo, useState } from 'react';
import type { Data, Layout } from 'plotly.js';
import Plot from '../components/Plot';
import { MultiSelectFilter } from '../components/Filters';
import { fetchUndervalued } from '../lib/api';
import { useDebounced } from '../hooks/useDebounced';
import type {
  UndervaluedCandidate,
  UndervaluedMicromarketRow,
  UndervaluedResponse,
  UndervaluedScatterPoint,
} from '../types/api';

const GRADE_ORDER = ['A', 'B', 'C', 'D', 'G'];
const GRADE_COLORS: Record<string, string> = {
  A: '#2ecc71',
  B: '#3498db',
  C: '#f39c12',
  D: '#e74c3c',
  G: '#9b59b6',
};

interface FormState {
  minDiscount: number;
  minPropscore: number;
  developerGrade?: string[];
  projectStatus?: string[];
  micromarket?: string[];
  wDiscount: number;
  wPropscore: number;
  wGrade: number;
}

const DEFAULTS: FormState = {
  minDiscount: 5,
  minPropscore: 2.5,
  projectStatus: ['available'],
  wDiscount: 0.40,
  wPropscore: 0.35,
  wGrade: 0.25,
};

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return '—';
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function fmtPct(n: number | null | undefined, signed = false, decimals = 1): string {
  if (n == null) return '—';
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

function fmtPossession(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function buildScatterTraces(
  points: UndervaluedScatterPoint[],
  thresholds: { minDiscount: number; minPropscore: number },
): { traces: Data[]; layout: Partial<Layout> } {
  const groups = new Map<string, UndervaluedScatterPoint[]>();
  for (const p of points) {
    const g = p.developerGrade ?? 'Unknown';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(p);
  }
  const ordered = [
    ...GRADE_ORDER.filter((g) => groups.has(g)),
    ...[...groups.keys()].filter((g) => !GRADE_ORDER.includes(g)),
  ];

  // Normalize opportunity score to bubble size 8–28
  const opps = points.map((p) => p.opportunityScore);
  const minOpp = Math.min(...opps, 0);
  const maxOpp = Math.max(...opps, 1);
  const sizeOf = (s: number) =>
    8 + ((s - minOpp) / Math.max(0.0001, maxOpp - minOpp)) * 20;

  const traces: Data[] = ordered.map((grade) => {
    const pts = groups.get(grade)!;
    return {
      type: 'scatter',
      mode: 'markers',
      name: grade,
      x: pts.map((p) => p.x),
      y: pts.map((p) => p.y),
      marker: {
        color: GRADE_COLORS[grade] ?? '#888',
        size: pts.map((p) => sizeOf(p.opportunityScore)),
        sizemode: 'diameter',
        line: { width: 1, color: 'white' },
      },
      text: pts.map(
        (p) =>
          `<b>${p.name ?? ''}</b><br>` +
          `${p.developerName ?? ''}<br>` +
          `${p.micromarket ?? ''}<br>` +
          `Discount: ${p.x.toFixed(1)}%<br>` +
          `PropScore: ${p.y.toFixed(2)}<br>` +
          `Opp. score: ${p.opportunityScore.toFixed(3)}<br>` +
          `Status: ${p.projectStatus ?? ''}`,
      ),
      hovertemplate: '%{text}<extra></extra>',
    };
  });

  const layout: Partial<Layout> = {
    title: { text: 'Discount vs PropScore — bubble size = opportunity score' },
    xaxis: {
      title: { text: 'Discount vs Micromarket Avg (%)' },
      ticksuffix: '%',
      gridcolor: '#f0f0f0',
    },
    yaxis: {
      title: { text: 'PropScore' },
      gridcolor: '#f0f0f0',
    },
    legend: { title: { text: 'Developer Grade' } },
    plot_bgcolor: 'white',
    paper_bgcolor: 'white',
    height: 480,
    margin: { l: 60, r: 20, t: 50, b: 50 },
    shapes: [
      {
        type: 'line',
        xref: 'x',
        yref: 'paper',
        x0: thresholds.minDiscount,
        x1: thresholds.minDiscount,
        y0: 0,
        y1: 1,
        line: { color: '#94a3b8', dash: 'dot', width: 1 },
      },
      {
        type: 'line',
        xref: 'paper',
        yref: 'y',
        x0: 0,
        x1: 1,
        y0: thresholds.minPropscore,
        y1: thresholds.minPropscore,
        line: { color: '#94a3b8', dash: 'dot', width: 1 },
      },
    ],
    annotations: [
      {
        xref: 'x',
        yref: 'paper',
        x: thresholds.minDiscount,
        y: 1,
        text: `Min discount (${thresholds.minDiscount}%)`,
        showarrow: false,
        xanchor: 'left',
        yanchor: 'top',
        font: { size: 10, color: '#64748b' },
      },
      {
        xref: 'paper',
        yref: 'y',
        x: 1,
        y: thresholds.minPropscore,
        text: `Min PropScore (${thresholds.minPropscore})`,
        showarrow: false,
        xanchor: 'right',
        yanchor: 'bottom',
        font: { size: 10, color: '#64748b' },
      },
    ],
  };
  return { traces, layout };
}

function CandidatesTable({ rows }: { rows: UndervaluedCandidate[] }) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Developer</th>
            <th>Grade</th>
            <th>Micromarket</th>
            <th className="num">Price/sqft</th>
            <th className="num">Market</th>
            <th className="num">Discount</th>
            <th className="num">PropScore</th>
            <th className="num">Opp.</th>
            <th>Status</th>
            <th>Possession</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name ?? '—'}</td>
              <td>{r.developerName ?? '—'}</td>
              <td>{r.developerGrade ?? '—'}</td>
              <td>{r.micromarket ?? '—'}</td>
              <td className="num">{fmtCurrency(r.pricePerSqft)}</td>
              <td className="num">{fmtCurrency(r.micromarketPriceAverage)}</td>
              <td className="num">{fmtPct(r.discountPct, true)}</td>
              <td className="num">{r.propscore != null ? r.propscore.toFixed(2) : '—'}</td>
              <td className="num">{r.opportunityScore.toFixed(3)}</td>
              <td>{r.projectStatus ?? '—'}</td>
              <td>{fmtPossession(r.possessionDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MicromarketTable({ rows }: { rows: UndervaluedMicromarketRow[] }) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Micromarket</th>
            <th className="num">Candidates</th>
            <th className="num">Avg Discount</th>
            <th className="num">Avg PropScore</th>
            <th className="num">Avg Opp. Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.micromarket}>
              <td>{r.micromarket}</td>
              <td className="num">{r.candidates}</td>
              <td className="num">{fmtPct(r.avgDiscount)}</td>
              <td className="num">{r.avgPropscore != null ? r.avgPropscore.toFixed(2) : '—'}</td>
              <td className="num">{r.avgOppScore.toFixed(3)}</td>
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

export default function UndervaluedPage() {
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [data, setData] = useState<UndervaluedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedForm = useDebounced(form, 200);

  useEffect(() => {
    let cancelled = false;
    fetchUndervalued(debouncedForm)
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

  const { traces, layout } = useMemo(() => {
    if (!data) return { traces: [] as Data[], layout: {} as Partial<Layout> };
    return buildScatterTraces(data.scatter, data.thresholds);
  }, [data]);

  const totalW = form.wDiscount + form.wPropscore + form.wGrade;
  const wDiscPct = totalW > 0 ? Math.round((form.wDiscount / totalW) * 100) : 0;
  const wPropPct = totalW > 0 ? Math.round((form.wPropscore / totalW) * 100) : 0;
  const wGradePct = totalW > 0 ? Math.round((form.wGrade / totalW) * 100) : 0;

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <h1>Undervalued</h1>
        <p className="dashboard-caption">
          Projects priced below their micromarket average, weighted by quality signals.
        </p>
      </header>

      {error && <div className="error-banner">Error: {error}</div>}

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <h2>Filters</h2>
          <Slider
            label="Min discount vs market"
            min={0}
            max={40}
            step={1}
            value={form.minDiscount}
            onChange={(v) => setForm((s) => ({ ...s, minDiscount: v }))}
            format={(v) => `${v}%`}
          />
          <Slider
            label="Min PropScore"
            min={1.0}
            max={5.0}
            step={0.1}
            value={form.minPropscore}
            onChange={(v) => setForm((s) => ({ ...s, minPropscore: v }))}
            format={(v) => v.toFixed(1)}
          />
          {data && (
            <>
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
            </>
          )}

          <h2 style={{ marginTop: 14 }}>Score weights</h2>
          <Slider
            label={`Discount (${wDiscPct}%)`}
            min={0}
            max={1}
            step={0.05}
            value={form.wDiscount}
            onChange={(v) => setForm((s) => ({ ...s, wDiscount: v }))}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label={`PropScore (${wPropPct}%)`}
            min={0}
            max={1}
            step={0.05}
            value={form.wPropscore}
            onChange={(v) => setForm((s) => ({ ...s, wPropscore: v }))}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label={`Developer grade (${wGradePct}%)`}
            min={0}
            max={1}
            step={0.05}
            value={form.wGrade}
            onChange={(v) => setForm((s) => ({ ...s, wGrade: v }))}
            format={(v) => v.toFixed(2)}
          />
        </aside>

        <section className="dashboard-main">
          {loading && !data ? (
            <p className="dashboard-placeholder">Loading...</p>
          ) : data ? (
            <>
              <div className="kpi-row">
                <Kpi label="Candidates" value={String(data.kpis.candidates)} />
                <Kpi label="Avg discount" value={fmtPct(data.kpis.avgDiscount)} />
                <Kpi label="Max discount" value={fmtPct(data.kpis.maxDiscount)} />
                <Kpi
                  label="Avg PropScore"
                  value={data.kpis.avgPropscore != null ? data.kpis.avgPropscore.toFixed(2) : '—'}
                />
                <Kpi label="Grade A/B projects" value={String(data.kpis.gradeABCount)} />
              </div>

              <div className="dashboard-split">
                <div className="chart-card chart-card-grow">
                  <Plot data={traces} layout={layout} />
                  <p className="chart-caption">
                    Top-right quadrant = high quality + deeply discounted. Best candidates live
                    there.
                  </p>
                </div>
                <aside className="methodology-card">
                  <h3>How scoring works</h3>
                  <p>
                    <strong>Opportunity Score</strong> is a weighted composite of three normalized
                    signals:
                  </p>
                  <ul>
                    <li>Discount vs market</li>
                    <li>PropScore</li>
                    <li>Developer Grade (A→5 … G→1)</li>
                  </ul>
                  <p>
                    All three are min-max normalized before weighting. Adjust the weights to
                    prioritize what matters most.
                  </p>
                </aside>
              </div>

              {data.candidates.length > 0 ? (
                <>
                  <h2 className="dashboard-subhead">Ranked candidates</h2>
                  <CandidatesTable rows={data.candidates} />
                  <h2 className="dashboard-subhead">Opportunity by micromarket</h2>
                  <MicromarketTable rows={data.micromarketBreakdown} />
                </>
              ) : (
                <p className="dashboard-placeholder">
                  No projects match the current filters. Try lowering the discount or PropScore
                  threshold.
                </p>
              )}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
