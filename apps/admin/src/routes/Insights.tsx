import { analyticsRanges, type AnalyticsRange } from '@nurserylink/shared';
import { ErrorState, Skeleton, cn, formatCount, formatUGX } from '@nurserylink/ui';
import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { en } from '../copy/en';
import { AreaChart, BarList, CHART, ChartCard, Donut, KpiCard, compactUGX } from '../features/insights/charts';
import { useAnalytics, type Analytics } from '../features/insights/api';
import { useParam } from '../lib/params';

const STATUS_COLOUR: Record<string, string> = {
  released: CHART.leaf,
  delivered: CHART.leafLight,
  dispatched: CHART.forest,
  escrow_held: CHART.canopy,
  pending_payment: CHART.sand,
  disputed: CHART.murram,
  refunded: CHART.murramLight,
  cancelled: CHART.bark,
};
const CATEGORY_COLOUR: Record<string, string> = {
  indigenous: CHART.forest,
  agroforestry: CHART.leafLight,
  exotic: CHART.sand,
  ornamental: CHART.murram,
  medicinal: CHART.murramLight,
  coffee: CHART.bark,
  cocoa: CHART.lake,
};

/** Axis and tooltip labels for each bucket: 3 Oct (day), w/c 29 Sep (week), Oct 2026 (month). */
const bucketLabels = (date: string, bucket: Analytics['bucket']) => {
  const d = new Date(`${date}T00:00:00`);
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
  if (bucket === 'month') {
    return { label: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d), long: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(d) };
  }
  return bucket === 'week' ? { label: day, long: `Week of ${day}` } : { label: day, long: day };
};

const RangePicker = ({ value, onChange }: { value: AnalyticsRange; onChange: (r: AnalyticsRange) => void }) => (
  <div role="group" aria-label={en.insights.range} className="flex rounded-full bg-paper p-1 shadow-card ring-1 ring-line">
    {analyticsRanges.map(r => (
      <button
        key={r}
        type="button"
        aria-pressed={value === r}
        onClick={() => { onChange(r); }}
        className={cn('min-h-9 rounded-full px-4 text-sm font-bold transition-colors', value === r ? 'bg-canopy text-paper' : 'text-canopy hover:bg-mist')}
      >
        {en.insights.ranges[r]}
      </button>
    ))}
  </div>
);

/** Insights: the figures behind the marketplace, in charts (the dashboard lists what needs action). */
const Insights = () => {
  const [raw, setRange] = useParam('range');
  const range = analyticsRanges.find(r => r === raw) ?? '30d';
  const [metric, setMetric] = useState<'sales' | 'orders'>('sales');
  const query = useAnalytics(range);
  const a = query.data;
  const vs = en.insights.vsPrevious[range];

  return (
    <div className="flex max-w-7xl flex-col gap-5">
      <PageHeader
        title={en.insights.title}
        intro={en.insights.intro}
        actions={<RangePicker value={range} onChange={r => { setRange(r === '30d' ? null : r, { resetPage: false }); }} />}
      />
      {query.isError && !a && <ErrorState title={en.common.loadFailed} onRetry={() => { void query.refetch(); }} retryLabel={en.common.retry} />}
      {!a && query.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
      )}
      {a && (
        <div className={cn('flex flex-col gap-5 transition-opacity', query.isFetching && 'opacity-70')}>
          {/* Phones: two short figures per row; the money figures (long) take the full width */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
            <KpiCard accent className="col-span-2 sm:col-span-1" label={en.insights.kpis.sales_ugx} {...a.kpis.sales_ugx} format={formatUGX} comparison={vs} />
            <KpiCard label={en.insights.kpis.orders} {...a.kpis.orders} format={formatCount} comparison={vs} />
            <KpiCard label={en.insights.kpis.seedlings_sold} {...a.kpis.seedlings_sold} format={formatCount} comparison={vs} />
            <KpiCard className="col-span-2 sm:col-span-1" label={en.insights.kpis.avg_order_ugx} {...a.kpis.avg_order_ugx} format={formatUGX} comparison={vs} />
            <KpiCard label={en.insights.kpis.new_buyers} {...a.kpis.new_buyers} format={formatCount} comparison={vs} />
            <KpiCard label={en.insights.kpis.free_seedlings} {...a.kpis.free_seedlings} format={formatCount} comparison={vs} />
          </div>

          <ChartCard
            title={en.insights.salesOverTime}
            action={
              <div role="group" aria-label={en.insights.show} className="flex rounded-full bg-mist p-1 ring-1 ring-line">
                {(['sales', 'orders'] as const).map(m => (
                  <button key={m} type="button" aria-pressed={metric === m} onClick={() => { setMetric(m); }} className={cn('min-h-8 rounded-full px-3 text-xs font-bold', metric === m ? 'bg-paper text-canopy shadow-card' : 'text-bark-muted')}>
                    {en.insights.metric[m]}
                  </button>
                ))}
              </div>
            }
          >
            {a.kpis.orders.value === 0 && <p className="text-sm text-bark-muted">{en.insights.empty}</p>}
            <AreaChart
              label={`${en.insights.salesOverTime}, ${en.insights.ranges[range]}`}
              points={a.series.map(p => ({ ...bucketLabels(p.date, a.bucket), value: metric === 'sales' ? p.sales_ugx : p.orders }))}
              format={metric === 'sales' ? formatUGX : formatCount}
              axisFormat={metric === 'sales' ? compactUGX : (n: number) => formatCount(Math.round(n))}
            />
          </ChartCard>

          <div className="grid gap-5 lg:grid-cols-3">
            <ChartCard title={en.insights.orderStatus} hint={en.insights.orderStatusHint}>
              <Donut
                centerLabel={en.insights.units.orders}
                segments={a.order_status.map(s => ({ key: s.status, label: en.orders.statuses[s.status], value: s.count, color: STATUS_COLOUR[s.status] ?? CHART.sand }))}
              />
            </ChartCard>
            <ChartCard title={en.insights.delivery}>
              <Donut
                centerLabel={en.insights.units.orders}
                segments={a.delivery.map(d => ({ key: d.type, label: en.insights.deliveryTypes[d.type], value: d.count, color: d.type === 'order_and_deliver' ? CHART.lake : CHART.murram }))}
              />
            </ChartCard>
            <ChartCard title={en.insights.paymentMethods}>
              <Donut
                centerLabel={en.insights.units.orders}
                segments={a.payment_methods.map(m => ({ key: m.method, label: en.insights.methods[m.method], sub: compactUGX(m.sales_ugx), value: m.count, color: m.method === 'mtn_momo' ? CHART.sun : m.method === 'airtel_money' ? CHART.laterite : CHART.lake }))}
              />
            </ChartCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title={en.insights.topSpecies}>
              {a.top_species.length === 0 ? <p className="text-sm text-bark-muted">{en.insights.emptyShort}</p> : (
                <BarList
                  color={CHART.leaf}
                  items={a.top_species.map(s => ({ key: s.species_id, label: s.common_name, value: s.seedlings, display: en.insights.topSpeciesUnit(formatCount(s.seedlings)), sub: compactUGX(s.sales_ugx), to: `/species/${s.species_id}` }))}
                />
              )}
            </ChartCard>
            <ChartCard title={en.insights.topNurseries}>
              {a.top_nurseries.length === 0 ? <p className="text-sm text-bark-muted">{en.insights.emptyShort}</p> : (
                <BarList
                  color={CHART.murram}
                  items={a.top_nurseries.map(n => ({ key: n.nursery_id, label: n.name, value: n.sales_ugx, display: formatUGX(n.sales_ugx), sub: en.insights.topNurseriesOrders(n.orders), to: `/nurseries/${n.nursery_id}` }))}
                />
              )}
            </ChartCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title={en.insights.stock} hint={en.insights.stockHint}>
              <Donut
                centerLabel={en.insights.units.seedlings}
                segments={a.stock_by_category.map(c => ({ key: c.category, label: en.species.categories[c.category], value: c.seedlings, color: CATEGORY_COLOUR[c.category] ?? CHART.sand }))}
              />
            </ChartCard>
            <ChartCard title={en.insights.campaigns}>
              {a.campaigns.length === 0 ? <p className="text-sm text-bark-muted">{en.insights.emptyShort}</p> : (
                <ul className="flex flex-col gap-4">
                  {a.campaigns.map(c => {
                    const given = c.allocated - c.remaining;
                    return (
                      <li key={c.id} className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate font-bold text-canopy">{c.title}</span>
                          <span className="shrink-0 text-xs text-bark-muted">{en.insights.campaignApplications(c.applications)}</span>
                        </div>
                        <div aria-hidden className="h-2.5 overflow-hidden rounded-full bg-mist ring-1 ring-line">
                          <div className="h-full rounded-full bg-sun" style={{ width: `${String(c.allocated > 0 ? Math.max((given / c.allocated) * 100, given > 0 ? 2 : 0) : 0)}%` }} />
                        </div>
                        <p className="text-xs text-bark-muted">{en.insights.campaignGiven(formatCount(given), formatCount(c.allocated))}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
};
export default Insights;
