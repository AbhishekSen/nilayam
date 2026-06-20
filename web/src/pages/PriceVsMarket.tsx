import { useEffect, useMemo, useState } from 'react';
import type { Data, Layout } from 'plotly.js';
import Plot from '../components/Plot';
import { MultiSelectFilter } from '../components/Filters';
import { fetchPriceVsMarket } from '../lib/api';
import { useDebounced } from '../hooks/useDebounced';
import type {
  PriceVsMarketOutlier,
  PriceVsMarketResponse,
  PriceVsMarketScatterPoint,
} from '../types/api';

const GRADE_ORDER = ['A', 'B', 'C', 'D', 'G'];
const GRADE_COLORS: Record<string, string> = {
  A: '#2ecc71',
  B: '#3498db',
  C: '#f39c12',
  D: '#e74c3c',
  G: '#9b59b6',
};

interface FilterState {
  city?: string[];
  developerGrade?: string[];
  projectStatus?: string[];
  showOnlyUnderpriced?: boolean;
}

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '—';
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function formatPct(n: number | null | undefined, signed = true): string {
  if (n == null) return '—';
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function buildScatterTraces(points: PriceVsMarketScatterPoint[]): Data[] {
  // Group points by developerGrade so each becomes its own trace (= legend entry, distinct color)
  const groups = new Map<string, PriceVsMarketScatterPoint[]>();
  for (const p of points) {
    const g = p.developerGrade ?? 'Unknown';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(p);
  }

  const ordered = [
    ...GRADE_ORDER.filter((g) => groups.has(g)),
    ...[...groups.keys()].filter((g) => !GRADE_ORDER.includes(g)),
  ];

  return ordered.map((grade) => {
    const pts = groups.get(grade)!;
    return {
      type: 'scatter',
      mode: 'markers',
      name: grade,
      x: pts.map((p) => p.x),
      y: pts.map((p) => p.y),
      marker: {
        color: GRADE_COLORS[grade] ?? '#888',
        size: pts.map((p) => p.bubbleSize),
        sizemode: 'diameter',
        line: { width: 1, color: 'white' },
      },
      text: pts.map(
        (p) =>
          `<b>${p.name ?? ''}</b><br>` +
          `${p.developerName ?? ''}<br>` +
          `${p.micromarket ?? ''}, ${p.city ?? ''}<br>` +
          `Project: ₹${Math.round(p.y).toLocaleString('en-IN')}/sqft<br>` +
          `Market: ₹${Math.round(p.x).toLocaleString('en-IN')}/sqft<br>` +
          `vs Market: ${p.vsMarketPct > 0 ? '+' : ''}${p.vsMarketPct.toFixed(1)}%<br>` +
          `Status: ${p.projectStatus ?? ''} · Pop: ${p.popularity ?? ''}`,
      ),
      hovertemplate: '%{text}<extra></extra>',
    } as Data;
  });
}

function OutlierTable({ rows, title }: { rows: PriceVsMarketOutlier[]; title: string }) {
  return (
    <section>
      <h3 className="dashboard-subhead">{title}</h3>
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
              <th className="num">vs Market</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name ?? '—'}</td>
                <td>{r.developerName ?? '—'}</td>
                <td>{r.developerGrade ?? '—'}</td>
                <td>{r.micromarket ?? '—'}</td>
                <td className="num">{formatCurrency(r.pricePerSqft)}</td>
                <td className="num">{formatCurrency(r.micromarketPriceAverage)}</td>
                <td className="num">{formatPct(r.vsMarketPct)}</td>
                <td>{r.projectStatus ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PriceVsMarketPage() {
  const [filterState, setFilterState] = useState<FilterState>({});
  const [data, setData] = useState<PriceVsMarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedFilters = useDebounced(filterState, 200);

  useEffect(() => {
    let cancelled = false;
    fetchPriceVsMarket(debouncedFilters)
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
  }, [debouncedFilters]);

  const scatterTraces = useMemo<Data[]>(() => {
    if (!data) return [];
    const traces = buildScatterTraces(data.scatter);
    // Parity line y=x
    const parity: Data = {
      type: 'scatter',
      mode: 'lines',
      name: 'At market price',
      x: data.axisRange,
      y: data.axisRange,
      line: { color: '#94a3b8', dash: 'dash', width: 1 },
      hoverinfo: 'skip',
      showlegend: true,
    };
    return [...traces, parity];
  }, [data]);

  const layout = useMemo<Partial<Layout>>(() => {
    const range = data?.axisRange ?? [0, 1];
    return {
      title: { text: 'Project Price/sqft vs Micromarket Average' },
      xaxis: {
        title: { text: 'Micromarket Avg Price/sqft (₹)' },
        range,
        tickprefix: '₹',
        tickformat: ',',
        gridcolor: '#f0f0f0',
      },
      yaxis: {
        title: { text: 'Project Price/sqft (₹)' },
        range,
        tickprefix: '₹',
        tickformat: ',',
        gridcolor: '#f0f0f0',
      },
      legend: { title: { text: 'Developer Grade' } },
      plot_bgcolor: 'white',
      paper_bgcolor: 'white',
      height: 540,
      margin: { l: 70, r: 20, t: 50, b: 50 },
    };
  }, [data]);

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <h1>Price vs Market</h1>
        <p className="dashboard-caption">
          Price per sqft of each project vs its micromarket average.
        </p>
      </header>

      {error && <div className="error-banner">Error: {error}</div>}

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <h2>Filters</h2>
          {data && (
            <>
              <div className="filter-row">
                <label className="filter-label">City</label>
                <MultiSelectFilter
                  options={data.filterOptions.cities}
                  value={filterState.city}
                  onChange={(v) =>
                    setFilterState((s) => ({ ...s, city: v ?? undefined }))
                  }
                />
              </div>
              <div className="filter-row">
                <label className="filter-label">Developer Grade</label>
                <MultiSelectFilter
                  options={data.filterOptions.developerGrades}
                  value={filterState.developerGrade}
                  onChange={(v) =>
                    setFilterState((s) => ({ ...s, developerGrade: v ?? undefined }))
                  }
                />
              </div>
              <div className="filter-row">
                <label className="filter-label">Project Status</label>
                <MultiSelectFilter
                  options={data.filterOptions.projectStatuses}
                  value={filterState.projectStatus}
                  onChange={(v) =>
                    setFilterState((s) => ({ ...s, projectStatus: v ?? undefined }))
                  }
                />
              </div>
              <div className="filter-row">
                <label className="filter-label inline">
                  <input
                    type="checkbox"
                    checked={filterState.showOnlyUnderpriced ?? false}
                    onChange={(e) =>
                      setFilterState((s) => ({
                        ...s,
                        showOnlyUnderpriced: e.target.checked || undefined,
                      }))
                    }
                  />
                  Show only underpriced
                </label>
              </div>
            </>
          )}
        </aside>

        <section className="dashboard-main">
          {loading && !data ? (
            <p className="dashboard-placeholder">Loading...</p>
          ) : data ? (
            <>
              <div className="kpi-row">
                <Kpi label="Projects" value={String(data.kpis.count)} />
                <Kpi label="Avg Price/sqft" value={formatCurrency(data.kpis.avgPricePerSqft)} />
                <Kpi label="Below market avg" value={`${data.kpis.belowMarketCount} projects`} />
                <Kpi label="Median vs market" value={formatPct(data.kpis.medianVsMarketPct)} />
              </div>

              <div className="chart-card">
                <Plot data={scatterTraces} layout={layout} />
                <p className="chart-caption">
                  Points <strong>below</strong> the dashed line are priced under their micromarket
                  average. Bubble size = popularity (A &gt; Z).
                </p>
              </div>

              <div className="dashboard-tables">
                <OutlierTable rows={data.topUnderpriced} title="Most underpriced vs market" />
                <OutlierTable rows={data.topOverpriced} title="Most overpriced vs market" />
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
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
