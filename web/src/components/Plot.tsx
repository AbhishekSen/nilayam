import { lazy, Suspense } from 'react';
import type { Data, Layout, Config } from 'plotly.js';
import type { PlotParams } from 'react-plotly.js';
import type { ComponentType } from 'react';

type FactoryFn = (plotly: unknown) => ComponentType<PlotParams>;

const PlotlyChart = lazy(async () => {
  const plotlyMod = await import('plotly.js-dist-min');
  const Plotly = (plotlyMod as { default?: unknown }).default ?? plotlyMod;
  const factoryMod = await import('react-plotly.js/factory');
  const exported = (factoryMod as { default?: unknown }).default ?? factoryMod;
  const factory = (typeof exported === 'function'
    ? exported
    : (exported as { default?: unknown })?.default) as FactoryFn;
  if (typeof factory !== 'function') {
    throw new Error('react-plotly.js/factory did not resolve to a function');
  }
  return { default: factory(Plotly) };
});

interface Props {
  data: Data[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  style?: React.CSSProperties;
  className?: string;
}

export default function Plot({ data, layout, config, style, className }: Props) {
  return (
    <Suspense fallback={<div className="plot-loading">Loading chart...</div>}>
      <PlotlyChart
        data={data}
        layout={layout as Layout}
        config={config}
        style={style ?? { width: '100%', height: '100%' }}
        className={className}
        useResizeHandler
      />
    </Suspense>
  );
}
