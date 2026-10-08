import { Button, ErrorState, Skeleton, cn, formatDateTime, formatPhone, formatRelative, formatUGX } from '@nurserylink/ui';
import { AlertTriangle, BarChart3, Banknote, CheckCircle2, ClipboardCheck, Clock, Gift, MessageSquareWarning, Package, PackageX, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { en } from '../copy/en';
import { useDashboard } from '../features/dashboard/api';
import { useSession } from '../lib/session';

const Panel = ({ icon: Icon, title, help, count, to, children, urgent }: { icon: LucideIcon; title: string; help: string; count: number; to: string; children: ReactNode; urgent?: boolean }) => (
  <section aria-labelledby={title} className={cn('relative flex flex-col gap-2 overflow-hidden rounded-lg bg-paper p-5 shadow-card ring-1', count > 0 && urgent ? 'ring-laterite/60' : 'ring-line')}>
    {/* A coloured edge: red when something urgent waits, green when clear */}
    <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', count === 0 ? 'bg-seedling' : urgent ? 'bg-laterite' : 'bg-murram')} />
    <div className="flex items-start justify-between gap-3">
      <h2 id={title} className="flex items-center gap-2 text-lg">
        <Icon aria-hidden className={cn('size-5 shrink-0', count > 0 && urgent ? 'text-laterite' : 'text-forest')} />
        {title}
      </h2>
      <span className={cn('font-stat text-4xl leading-none font-bold tabular-nums', count === 0 ? 'text-seedling' : urgent ? 'text-laterite' : 'text-murram')}>
        {count}
      </span>
    </div>
    <p className="text-sm text-bark-muted">{help}</p>
    {count > 0 && <ul className="flex flex-col divide-y divide-line text-sm">{children}</ul>}
    {count > 0 && <Link to={to} className="self-start text-sm font-bold">{en.dashboard.viewAll}</Link>}
  </section>
);

const Row = ({ to, children }: { to: string; children: ReactNode }) => (
  <li><Link to={to} className="flex min-h-9 items-center justify-between gap-3 py-1.5 text-bark no-underline hover:text-forest">{children}</Link></li>
);

/** The items that need an admin, not vanity metrics. */
const Dashboard = () => {
  const { user } = useSession();
  const dash = useDashboard();
  const d = dash.data;
  return (
    <div>
      <p className="mb-1 text-sm font-bold text-murram" title={en.dashboard.greetingMeaning}>{en.dashboard.greeting(user?.full_name ?? '')}</p>
      <PageHeader
        title={en.dashboard.title}
        intro={en.dashboard.intro}
        actions={<Button asChild size="sm" variant="secondary"><Link to="/insights"><BarChart3 aria-hidden />{en.dashboard.seeInsights}</Link></Button>}
      />
      {dash.isPending && <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-md" />)}</div>}
      {dash.isError && <ErrorState title={en.common.loadFailed} onRetry={() => { void dash.refetch(); }} retryLabel={en.common.retry} />}
      {d && (
        <>
          {[d.orders_to_dispatch, d.disputed_orders, d.stuck_escrow, d.failed_payouts, d.stale_stock, d.pending_applications, d.unparsed_sms, d.nurseries_to_verify].every(s => s.count === 0) && (
            <p className="mb-4 flex items-center gap-2 rounded-md bg-seedling-tint px-4 py-3 font-bold text-canopy"><CheckCircle2 aria-hidden className="size-5" />{en.dashboard.allClear}</p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel icon={Package} title={en.dashboard.toDispatch} help={en.dashboard.toDispatchHelp} count={d.orders_to_dispatch.count} to="/orders?status=escrow_held">
              {d.orders_to_dispatch.items.map(o => (
                <Row key={o.id} to={`/orders/${o.id}`}>
                  <span><span className="font-mono font-bold">{o.short_code}</span> · {o.nursery_name} · {o.buyer_name}</span>
                  <span className="whitespace-nowrap text-bark-muted">{o.paid_at ? formatRelative(o.paid_at) : formatUGX(o.grand_total)}</span>
                </Row>
              ))}
            </Panel>
            <Panel icon={AlertTriangle} urgent title={en.dashboard.disputed} help={en.dashboard.disputedHelp} count={d.disputed_orders.count} to="/orders?status=disputed">
              {d.disputed_orders.items.map(o => (
                <Row key={o.id} to={`/orders/${o.id}`}>
                  <span><span className="font-mono font-bold">{o.short_code}</span> · {o.nursery_name} · {o.buyer_name}</span>
                  <span className="whitespace-nowrap">{formatUGX(o.grand_total)}</span>
                </Row>
              ))}
            </Panel>
            <Panel icon={Banknote} urgent title={en.dashboard.failedPayouts} help={en.dashboard.failedPayoutsHelp} count={d.failed_payouts.count} to="/payouts?status=failed">
              {d.failed_payouts.items.map(p => (
                <Row key={p.id} to={`/orders/${p.order_id}`}>
                  <span><span className="font-mono font-bold">{p.short_code}</span> · {formatPhone(p.msisdn)} · {en.dashboard.attempts(p.attempts)}</span>
                  <span className="whitespace-nowrap">{formatUGX(p.amount)}</span>
                </Row>
              ))}
            </Panel>
            <Panel icon={PackageX} urgent title={en.dashboard.stuck(d.thresholds.stuck_escrow_hours)} help={en.dashboard.stuckHelp} count={d.stuck_escrow.count} to="/orders?status=escrow_held">
              {d.stuck_escrow.items.map(o => (
                <Row key={o.id} to={`/orders/${o.id}`}>
                  <span><span className="font-mono font-bold">{o.short_code}</span> · {o.nursery_name}</span>
                  <span className="whitespace-nowrap text-bark-muted">{o.paid_at ? formatRelative(o.paid_at) : ''}</span>
                </Row>
              ))}
            </Panel>
            <Panel icon={Gift} title={en.dashboard.pendingApps} help={en.dashboard.pendingAppsHelp} count={d.pending_applications.count} to={`/campaigns/${d.pending_applications.items[0]?.campaign_id ?? ''}/applications`}>
              {d.pending_applications.items.map(a => (
                <Row key={a.id} to={`/campaigns/${a.campaign_id}/applications`}>
                  <span>{a.applicant_name} · {a.campaign_title}</span>
                  <span className="whitespace-nowrap">{a.quantity_requested}</span>
                </Row>
              ))}
            </Panel>
            <Panel icon={Clock} title={en.dashboard.staleStock(d.thresholds.stale_stock_days)} help={en.dashboard.staleStockHelp} count={d.stale_stock.count} to="/nurseries">
              {d.stale_stock.items.map(n => (
                <Row key={n.id} to={`/inventory?nursery=${n.id}`}>
                  <span>{n.name}</span>
                  <span className="whitespace-nowrap text-bark-muted">{n.stock_updated_at ? formatRelative(n.stock_updated_at) : en.dashboard.neverUpdated}</span>
                </Row>
              ))}
            </Panel>
            <Panel icon={ClipboardCheck} title={en.dashboard.toVerify} help={en.dashboard.toVerifyHelp} count={d.nurseries_to_verify.count} to="/nurseries?show=to_verify">
              {d.nurseries_to_verify.items.map(n => (
                <Row key={n.id} to={`/nurseries/${n.id}`}>
                  <span>{n.name}</span>
                  <span className="whitespace-nowrap text-bark-muted">{n.district_name}</span>
                </Row>
              ))}
            </Panel>
            <Panel icon={MessageSquareWarning} title={en.dashboard.unparsedSms(d.thresholds.sms_window_days)} help={en.dashboard.unparsedSmsHelp} count={d.unparsed_sms.count} to="/audit-log?action=sms.unrecognised">
              {d.unparsed_sms.items.map(m => (
                <Row key={m.id} to="/audit-log?action=sms.unrecognised">
                  <span>{m.sender ? formatPhone(m.sender) : '?'}: “{m.text}” <span className="text-bark-muted">({m.reason})</span></span>
                  <span className="whitespace-nowrap text-bark-muted">{formatDateTime(m.created_at)}</span>
                </Row>
              ))}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};
export default Dashboard;
