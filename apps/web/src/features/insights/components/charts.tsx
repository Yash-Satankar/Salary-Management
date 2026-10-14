'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const compactUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const wholeUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

// Recessive axes and grid; series colours are the validated --chart-1/--chart-2 pair.
const AXIS = { fontSize: 12, fill: 'var(--muted-foreground)' };
const GRID = 'var(--border)';
const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--popover-foreground)',
};

export interface AverageMedianDatum {
  label: string;
  /** Approximate US dollars (display only; derived from cents). */
  average: number;
  median: number;
}

/** Grouped bars of average vs median in approximate USD, one group per country or department. */
export function AverageMedianChart({ data, title }: { data: AverageMedianDatum[]; title: string }) {
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(value: number) => `≈${compactUsd.format(value)}`}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => `≈ ${wholeUsd.format(Number(value))}`}
            />
            {/* Legend text stays in the text colour; only the swatch carries the series colour. */}
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value) => <span className="text-foreground">{value}</span>}
            />
            <Bar
              dataKey="average"
              name="Average"
              fill="var(--chart-1)"
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
            />
            <Bar
              dataKey="median"
              name="Median"
              fill="var(--chart-2)"
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export interface DistributionDatum {
  range: string;
  count: number;
}

/** Histogram of local salaries; one series, so the title names it and no legend is needed. */
export function DistributionChart({ data, title }: { data: DistributionDatum[]; title: string }) {
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barCategoryGap={2}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="range" tick={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [`${value} employees`, 'Headcount']}
            />
            <Bar dataKey="count" name="Employees" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Cents → whole dollars for chart geometry only; all displayed text uses exact formatting. */
export const centsToDollars = (amountMinor: number) => Math.round(amountMinor / 100);
