import '@nurserylink/ui/library-fonts.css';
import { isApiError } from '@nurserylink/api-client';
import { Button, ErrorState, SkeletonList, formatUGX } from '@nurserylink/ui';
import { ArrowLeft, LocateFixed } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { CachedNote } from '../components/CachedNote';
import { Picture } from '../components/Picture';
import { usePageTitle } from '../components/usePageTitle';
import { en } from '../copy/en';
import { useSpeciesProfile } from '../features/library/api';
import { GrowthChart } from '../features/library/GrowthChart';
import { SpecimenPlate } from '../features/library/SpecimenPlate';
import { NotFoundPage } from './NotFound';
import { SpeciesPill } from '../components/Pills';

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-3 border-t border-canopy/20 pt-5">
    <h2 className="font-serif text-xl font-semibold">{title}</h2>
    {children}
  </section>
);

/** A species profile set out like a botanical specimen sheet (FR-19). */
const Species = () => {
  const { slug = '' } = useParams();
  const profile = useSpeciesProfile(slug);
  const s = profile.data?.data;
  usePageTitle(s?.common_name ?? en.library.title);

  if (isApiError(profile.error) && profile.error.status === 404) return <NotFoundPage />;
  if (profile.isPending) return <SkeletonList rows={4} label={en.library.title} />;
  if (!s) {
    const offline = isApiError(profile.error) && profile.error.isOffline;
    return <ErrorState title={offline ? en.states.offlineNoCache : en.species.loadFailed} offline={offline} onRetry={() => { void profile.refetch(); }} retryLabel={en.states.retry} />;
  }

  const [lead, ...gallery] = s.media;
  const from = s.min_price !== null ? formatUGX(s.min_price) : null;
  const to = s.max_price !== null ? formatUGX(s.max_price) : null;

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-5">
      <Link to={`/library?category=${s.category}`} className="flex min-h-11 items-center gap-2 self-start font-bold">
        <ArrowLeft aria-hidden className="size-5" />
        {en.species.back} · {en.categories[s.category]}
      </Link>
      {profile.data && <CachedNote fromCache={profile.data.fromCache} fetchedAt={profile.data.fetchedAt} />}

      {/* The sheet: white paper with a thin frame, like a herbarium mount */}
      <div className="flex flex-col gap-6 rounded-sm bg-paper p-5 ring-1 ring-canopy/40 md:p-8">
        <header className="grid gap-5 md:grid-cols-[280px_1fr]">
          {lead && (
            <figure className="flex flex-col gap-2">
              <Picture src={lead.url} alt={`${s.common_name} (${s.scientific_name})`} width={560} height={420} sizes="(min-width: 768px) 280px, 100vw" priority className="aspect-[4/3] w-full rounded-sm object-cover ring-1 ring-line" />
              {lead.caption && <figcaption className="text-xs text-bark-muted">{lead.caption}</figcaption>}
            </figure>
          )}
          <div className="flex flex-col gap-3">
            <div>
              <h1 className="text-3xl">{s.common_name}</h1>
              <p className="font-serif text-2xl text-bark-muted italic" lang="la">{s.scientific_name}</p>
            </div>
            {s.local_names.length > 0 && (
              <p>
                <span className="font-bold">{en.species.alsoCalled}: </span>
                {s.local_names.map(l => `${l.name} (${l.language})`).join(' · ')}
              </p>
            )}
            <p className="flex flex-wrap items-center gap-2">
              <SpeciesPill category={s.category} className="px-3 py-1 text-sm" />
              <span className="rounded-full bg-mist px-3 py-1 text-sm font-bold text-bark ring-1 ring-line">{en.speciesDrawer.pace[s.growth_pace]}</span>
            </p>
            <p className="text-bark-muted">{en.species.availability(s.nursery_count, from, to)}</p>
            {s.reference_price && (
              <p className="flex flex-col gap-0.5 rounded-sm bg-sky-tint px-3 py-2 text-sm text-bark">
                <span>
                  <span className="font-bold text-lake">{en.species.priceGuide}: </span>
                  {en.species.nfaPrice(formatUGX(s.reference_price.ugx), s.reference_price.pot_inches)}
                </span>
                <Link to="/news/nfa-seedling-price-guide" className="flex min-h-11 items-center self-start">{en.species.priceGuideMore}</Link>
              </p>
            )}
            {/* FR-20: research turns straight into a supplier search near the user */}
            <Button asChild size="lg" className="self-start">
              <Link to={`/nurseries?species=${encodeURIComponent(s.slug)}&sort=nearest`}>
                <LocateFixed aria-hidden />
                {en.species.findNearMe}
              </Link>
            </Button>
          </div>
        </header>

        {s.height_timeline.length > 0 && (
          <Section title={en.species.growthHeading}>
            <GrowthChart timeline={s.height_timeline} />
          </Section>
        )}

        {(s.canopy_notes || s.root_notes) && (
          <Section title={en.species.specimenHeading}>
            <SpecimenPlate canopy={s.canopy_notes} roots={s.root_notes} />
          </Section>
        )}

        {s.ecological_zones.length > 0 && (
          <Section title={en.species.zonesHeading}>
            <ul className="flex flex-wrap gap-2">
              {s.ecological_zones.map(z => <li key={z} className="rounded-full bg-mist px-3 py-1 text-sm ring-1 ring-line">{z}</li>)}
            </ul>
          </Section>
        )}

        {gallery.length > 0 && (
          <Section title={en.species.photos}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {gallery.map(m => (
                <li key={m.url}>
                  <figure className="flex flex-col gap-1">
                    <Picture src={m.url} alt={m.caption ?? s.common_name} width={320} height={240} sizes="(min-width: 640px) 33vw, 50vw" className="aspect-[4/3] w-full rounded-sm object-cover" />
                    {m.caption && <figcaption className="text-xs text-bark-muted">{m.caption}</figcaption>}
                  </figure>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </article>
  );
};
export default Species;
