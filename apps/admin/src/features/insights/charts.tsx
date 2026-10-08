import { cn, formatCount } from '@nurserylink/ui';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { en } from '../../copy/en';

/**
 * Small, dependency-free SVG charts in the "Earth & canopy" palette. Each one is drawn at its real
 * width (so text stays legible), and each has a text alternative: a visually hidden table or a
 * legend with every figure, so screen-reader users get the same information.
 */

export const CHART = {
  canopy: '#1b6e44',
  forest: '#1d7647',
  leaf: '#22804d',
  leafLight: '#7cc48a',
  murram: '#b8501f',
  murramLight: '#ffd9c2',
  sun: '#f2b705',
  sand: '#d9c9a8',
  bark: '#5e5248',
  line: '#e7dece',
  laterite: '#b42318',
  lake: '#2b6a97',
};

/** UGX 1,250,000 → "UGX 1.3M"; for axis labels and tight spaces (full amounts appear elsewhere). */
export const compactUGX = (n: number) =>
  `UGX ${new Intl.NumberFormat('en-UG', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`;

const useWidth = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => { setWidth(Math.floor(entries[0]?.contentRect.width ?? 0)); });
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, []);
  return [ref, width] as const;
};

/** A card that frames each chart: title, an optional hint, then the chart. */
export const ChartCard = ({ title, hint, action, children, className }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) => {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn('flex min-w-0 flex-col gap-4 rounded-lg bg-paper p-5 shadow-card ring-1 ring-line', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id={id} className="text-lg">{title}</h2>
          {hint && <p className="text-xs text-bark-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
};

/** A headline figure with its change against the previous period. */
export const KpiCard = ({ label, value, previous, format, comparison, accent = false, className }: {
  label: string;
  value: number;
  previous: number;
  format: (n: number) => string;
  comparison: string;
  accent?: boolean;
  className?: string;
}) => {
  const change = previous === 0 ? (value === 0 ? 0 : null) : (value - previous) / previous;
  const up = change !== null && change > 0;
  const down = change !== null && change < 0;
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg p-4 shadow-card ring-1', accent ? 'on-dark bg-canopy ring-canopy' : 'bg-paper ring-line', className)}>
      <p className={cn('text-sm font-bold', accent ? 'text-mist/85' : 'text-bark-muted')}>{label}</p>
      <p className={cn('font-stat text-3xl leading-none font-bold tabular-nums sm:text-4xl', accent ? 'text-paper' : 'text-canopy')}>{format(value)}</p>
      <p className={cn('flex items-center gap-1 text-xs', accent ? 'text-mist/85' : 'text-bark-muted')}>
        {change === null ? (
          <span className={cn('rounded-full px-1.5 py-0.5 font-bold', accent ? 'bg-paper/15 text-paper' : 'bg-seedling-tint text-canopy')}>{en.insights.newValue}</span>
        ) : change === 0 ? (
          <span className="font-bold">{en.insights.noChange}</span>
        ) : (
          <span className={cn('flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold', up && (accent ? 'bg-paper/15 text-paper' : 'bg-seedling-tint text-canopy'), down && (accent ? 'bg-paper/15 text-murram-light' : 'bg-laterite-tint text-laterite'))}>
            {up ? <ArrowUpRight aria-hidden className="size-3.5" /> : <ArrowDownRight aria-hidden className="size-3.5" />}
            <span className="sr-only">{up ? 'up ' : 'down '}</span>
            {Math.abs(Math.round(change * 100))}%
          </span>
        )}{' '}
        {comparison}
      </p>
    </div>
  );
};

/** Sales (or orders) over time: a soft area under a line, with a few gridlines and labels. */
export const AreaChart = ({ points, format, axisFormat, label, height = 240 }: {
  points: { label: string; long: string; value: number }[];
  format: (n: number) => string;
  axisFormat: (n: number) => string;
  label: string;
  height?: number;
}) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const gradient = useId();
  const [hover, setHover] = useState<number | null>(null);
  const PAD = { top: 12, right: 12, bottom: 28, left: 64 };
  const w = Math.max(width, 280);
  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const max = Math.max(...points.map(p => p.value), 1);
  // Round the top of the scale to a tidy number
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / magnitude) * magnitude;
  const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${String(PAD.top + innerH)} L${x(0).toFixed(1)},${String(PAD.top + innerH)} Z`;
  // At most ~7 x labels, evenly spaced, always including the last
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 90))));
  const active = hover === null ? null : points[hover];

  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={height} role="img" aria-label={label} className="block overflow-visible">
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={CHART.leaf} stopOpacity="0.35" />
            <stop offset="100%" stopColor={CHART.leaf} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PAD.left} x2={w - PAD.right} y1={y(top * f)} y2={y(top * f)} stroke={CHART.line} strokeDasharray={f === 0 ? undefined : '3 4'} />
            <text x={PAD.left - 8} y={y(top * f)} dy="0.32em" textAnchor="end" fontSize="12" fill={CHART.bark}>{axisFormat(top * f)}</text>
          </g>
        ))}
        {points.length > 0 && (
          <>
            <path d={area} fill={`url(#${gradient})`} />
            <path d={line} fill="none" stroke={CHART.forest} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text key={p.long} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="12" fill={CHART.bark}>{p.label}</text>
          ) : null
        )}
        {/* Hover targets, one band per point */}
        {points.map((p, i) => (
          <rect
            key={`h${p.long}`}
            x={x(i) - innerW / Math.max(points.length - 1, 1) / 2}
            y={PAD.top}
            width={innerW / Math.max(points.length - 1, 1)}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => { setHover(i); }}
            onMouseLeave={() => { setHover(null); }}
          />
        ))}
        {active && hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke={CHART.murram} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(active.value)} r="5" fill="#ffffff" stroke={CHART.murram} strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {active && hover !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md bg-canopy px-3 py-1.5 text-xs whitespace-nowrap text-paper shadow-float"
          style={{ left: Math.min(Math.max(x(hover), 70), w - 70), top: y(active.value) - 10 }}
        >
          <span className="block font-bold">{format(active.value)}</span>
          <span className="text-mist/90">{active.long}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>{en.insights.chartTable}</caption>
        <tbody>
          {points.map(p => <tr key={`t${p.long}`}><th scope="row">{p.long}</th><td>{format(p.value)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
};

/** Shares of a whole: a donut with the total in the middle, and a legend with every figure. */
export const Donut = ({ segments, centerLabel, format = formatCount }: {
  segments: { key: string; label: string; sub?: string; value: number; color: string }[];
  centerLabel: string;
  format?: (n: number) => string;
}) => {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const R = 70;
  const STROKE = 22;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    // Beside its legend only when the card is wide enough (a container query), otherwise stacked
    <div className="@container">
    <div className="flex flex-col items-center gap-4 @sm:flex-row @sm:items-center">
      <svg width="180" height="180" viewBox="0 0 180 180" aria-hidden className="shrink-0">
        <circle cx="90" cy="90" r={R} fill="none" stroke={CHART.line} strokeWidth={STROKE} />
        {total > 0 &&
          segments.map(s => {
            const len = (s.value / total) * C;
            // A hairline gap between segments, unless one segment is the whole ring
            const gap = segments.filter(x => x.value > 0).length > 1 ? 2 : 0;
            const el = (
              <circle
                key={s.key}
                cx="90"
                cy="90"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeDasharray={`${String(Math.max(len - gap, 0))} ${String(C)}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 90 90)"
              />
            );
            offset += len;
            return el;
          })}
        <text x="90" y="86" textAnchor="middle" className="font-display" fontSize="26" fontWeight="600" fill={CHART.canopy}>{format(total)}</text>
        <text x="90" y="108" textAnchor="middle" fontSize="12" fill={CHART.bark}>{centerLabel}</text>
      </svg>
      <ul className="flex w-full flex-col gap-2 text-sm">
        {segments.map(s => (
          <li key={s.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="size-3 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate">{s.label}</span>
                {s.sub && <span className="truncate text-xs text-bark-muted">{s.sub}</span>}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-bold">{format(s.value)}</span>
              <span className="ml-2 text-bark-muted">{total > 0 ? `${String(Math.round((s.value / total) * 100))}%` : '0%'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
};

/** A ranked list as horizontal bars: label above, the bar, the figure at the end. */
export const BarList = ({ items, color = CHART.forest }: {
  items: { key: string; label: string; value: number; display: string; sub?: string; to?: string }[];
  color?: string;
}) => {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={item.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-baseline gap-2">
              <span aria-hidden className="w-4 shrink-0 text-right font-display text-bark-muted">{i + 1}</span>
              {item.to ? <Link to={item.to} className="truncate font-bold text-canopy">{item.label}</Link> : <span className="truncate font-bold text-canopy">{item.label}</span>}
              {item.sub && <span className="hidden shrink-0 text-xs text-bark-muted sm:inline">{item.sub}</span>}
            </span>
            <span className="shrink-0 font-bold tabular-nums">{item.display}</span>
          </div>
          <div aria-hidden className="ml-6 h-2.5 overflow-hidden rounded-full bg-mist">
            <div className="h-full rounded-full" style={{ width: `${String(Math.max((item.value / max) * 100, 2))}%`, background: color }} />
          </div>
        </li>
      ))}
    </ol>
  );
};
