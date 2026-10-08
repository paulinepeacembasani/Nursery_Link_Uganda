import { isApiError } from '@nurserylink/api-client';
import { Badge, Button, EligibilityForm, EmptyState, ErrorState, Skeleton, SkeletonList, StockMeter, formatCount, formatDate, toast } from '@nurserylink/ui';
import { ArrowLeft, LogIn } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { CachedNote } from '../components/CachedNote';
import { usePageTitle } from '../components/usePageTitle';
import { en } from '../copy/en';
import { useApply, useCampaign, useMyApplications, type Application } from '../features/campaigns/api';
import { FunderBadge } from '../features/campaigns/FunderBadge';
import { useSession } from '../lib/session';
import { NotFoundPage } from './NotFound';

const LocationMap = lazy(() => import('../components/LocationMap'));

const TONE = { pending: 'info', approved: 'positive', rejected: 'danger', collected: 'positive' } as const;

const ApplicationStatus = ({ a }: { a: Application }) => (
  <section aria-labelledby="my-application" className="flex flex-col gap-2 rounded-lg bg-paper shadow-card p-5 ring-1 ring-line">
    <h2 id="my-application" className="text-lg">{en.freeSeedlings.statusHeading}</h2>
    <Badge tone={TONE[a.status]} className="self-start py-1">{en.freeSeedlings.status[a.status]}</Badge>
    <p>{en.freeSeedlings.statusHelp[a.status]}</p>
    <p className="text-sm text-bark-muted">{en.freeSeedlings.requested(formatCount(a.quantity_requested))} · {formatDate(a.created_at)}</p>
  </section>
);

/** One campaign (FR-16, FR-17): stock meter, funder, pickup point, checklist and the application form. */
const Campaign = () => {
  const { id = '' } = useParams();
  const location = useLocation();
  const campaign = useCampaign(id);
  const { user } = useSession();
  const applications = useMyApplications(user?.role === 'buyer');
  const apply = useApply(id);
  const [serverError, setServerError] = useState<string | null>(null);
  const c = campaign.data?.data;
  usePageTitle(c?.title ?? en.freeSeedlings.title);

  if (isApiError(campaign.error) && (campaign.error.status === 404 || campaign.error.status === 400)) return <NotFoundPage />;
  if (campaign.isPending) return <SkeletonList rows={3} />;
  if (!c) {
    const offline = isApiError(campaign.error) && campaign.error.isOffline;
    return <ErrorState title={offline ? en.states.offlineNoCache : en.freeSeedlings.loadFailed} offline={offline} onRetry={() => { void campaign.refetch(); }} retryLabel={en.states.retry} />;
  }

  const mine = applications.data?.find(a => a.campaign.id === c.id);

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link to="/free-seedlings" className="flex min-h-11 items-center gap-2 self-start font-bold">
        <ArrowLeft aria-hidden className="size-5" />
        {en.freeSeedlings.back}
      </Link>
      {campaign.data && <CachedNote fromCache={campaign.data.fromCache} fetchedAt={campaign.data.fetchedAt} />}

      <header className="flex flex-col gap-3 overflow-hidden rounded-lg bg-paper p-5 pt-0 shadow-card ring-1 ring-line">
        <span aria-hidden className="-mx-5 mb-2 h-2 bg-sun" />
        <span className="self-start rounded-full bg-sun px-2.5 py-0.5 text-xs font-bold text-bark ring-1 ring-canopy">{en.home.modules.free}</span>
        <h1 className="text-2xl md:text-3xl">{c.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-bark-muted">
          <FunderBadge type={c.funder_type} />
          {en.freeSeedlings.fundedBy(c.funder_name)}
        </p>
        <p>{c.purpose}</p>
        <p className="font-bold text-canopy">
          {c.is_open ? en.freeSeedlings.closes(formatDate(c.ends_at)) : en.freeSeedlings.closed}
        </p>
        <StockMeter remaining={c.remaining_stock} total={c.allocated_stock} label={en.freeSeedlings.left(formatCount(c.remaining_stock), c.remaining_pct)} />
        <p className="text-sm font-bold">{en.freeSeedlings.left(formatCount(c.remaining_stock), c.remaining_pct)}</p>
      </header>

      <section aria-labelledby="trees" className="flex flex-col gap-2 rounded-lg bg-paper shadow-card p-5 ring-1 ring-line">
        <h2 id="trees" className="text-lg">{en.freeSeedlings.trees}</h2>
        <ul className="flex flex-col divide-y divide-line">
          {c.species.map(s => (
            <li key={s.slug} className="flex items-center justify-between gap-3">
              <Link to={`/library/${s.slug}`} className="flex min-h-11 items-center underline">{s.common_name}</Link>
              <span className="font-bold">{formatCount(s.quantity)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pickup" className="flex flex-col gap-3 rounded-lg bg-paper shadow-card p-5 ring-1 ring-line">
        <h2 id="pickup" className="text-lg">{en.freeSeedlings.pickupHeading}</h2>
        <p className="flex items-center gap-2">
          <Link to={`/nurseries?nursery=${c.pickup_nursery.id}`} className="flex min-h-11 items-center underline">{en.freeSeedlings.pickupAt(c.pickup_nursery.name, c.sub_county.name)}</Link>
        </p>
        <Suspense fallback={<Skeleton className="h-72 rounded-md" />}>
          <LocationMap nursery={c.pickup_nursery.location} label={en.freeSeedlings.pickupHeading} />
        </Suspense>
      </section>

      {mine ? (
        <ApplicationStatus a={mine} />
      ) : !c.is_open ? (
        <EmptyState title={en.freeSeedlings.closed} action={<Button asChild variant="secondary"><Link to="/free-seedlings">{en.freeSeedlings.seeRunning}</Link></Button>}>
          {en.freeSeedlings.closedBody}
        </EmptyState>
      ) : (
        <section aria-labelledby="apply" className="flex flex-col gap-3 rounded-lg bg-paper shadow-card p-5 ring-1 ring-line">
          <h2 id="apply" className="text-lg">{en.freeSeedlings.eligibilityHeading}</h2>
          {user ? (
            <>
              <p className="text-bark-muted">{en.freeSeedlings.eligibilityIntro}</p>
              <EligibilityForm
                rules={c.eligibility_rules}
                maxQuantity={c.remaining_stock}
                labels={en.freeSeedlings}
                busy={apply.isPending}
                serverError={serverError}
                onSubmit={application => {
                  setServerError(null);
                  apply.mutate(application, {
                    onSuccess: () => { toast.success(en.freeSeedlings.applied, en.freeSeedlings.statusHelp.pending); },
                    onError: err => { setServerError(isApiError(err) ? err.message : en.states.loadFailed); },
                  });
                }}
              />
            </>
          ) : (
            <>
              {/* The checklist is visible before signing in, so people know if they qualify */}
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {c.eligibility_rules.map(r => <li key={r.key}>{r.label}{r.required ? '' : ` (${en.freeSeedlings.optional})`}</li>)}
              </ul>
              <p className="text-bark-muted">{en.freeSeedlings.signInHint}</p>
              <Button asChild size="lg" className="self-start">
                <Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>
                  <LogIn aria-hidden />
                  {en.freeSeedlings.signInToApply}
                </Link>
              </Button>
            </>
          )}
        </section>
      )}
    </article>
  );
};
export default Campaign;
