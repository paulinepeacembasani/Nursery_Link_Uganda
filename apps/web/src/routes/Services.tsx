import { Button, Field, Input, Select, cn } from '@nurserylink/ui';
import { ArrowRight, Check } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { serviceTypes, type ServiceType } from '@nurserylink/shared';
import { PageHero } from '../components/PageHero';
import { Picture } from '../components/Picture';
import { usePageTitle } from '../components/usePageTitle';
import { en } from '../copy/en';
import { IMAGES } from '../data/images';
import { RequestService } from '../features/services/RequestService';

type ServiceKey = keyof typeof en.services.items;

/** Each service with its photo, and whether people can use it today or it is still being set up. */
const SERVICES: { key: ServiceKey; photo: keyof typeof IMAGES; type?: ServiceType; focus?: string }[] = [
  { key: 'plan', photo: 'agroforestry-masaka', type: 'farm_plan' },
  { key: 'site', photo: 'western-hills', type: 'site_visit' },
  { key: 'planting', photo: 'community-planting', type: 'planting', focus: 'object-[50%_35%]' },
  { key: 'watering', photo: 'nurseryman-kapchorwa', type: 'watering' },
  // Delivery is ordered with the seedlings, at checkout
  { key: 'delivery', photo: 'boda-delivery' },
  { key: 'orchard', photo: 'sp-mango', type: 'orchard_care' },
  { key: 'survival', photo: 'mabira-forest', type: 'survival_check' },
  { key: 'training', photo: 'hero-nursery-beds', type: 'training' },
];

/** The page's name for each service type the API knows. */
const SERVICE_TITLES = Object.fromEntries(
  SERVICES.flatMap(s => (s.type ? [[s.type, en.services.items[s.key].title]] : []))
) as Record<ServiceType, string>;

const SQ_M_PER_ACRE = 4046.86;
const SPACING_M = { woodlot: 3, eucalyptus: 2.5, agroforestry: 6, orchard: 8 } as const;
type Kind = keyof typeof SPACING_M;

const count = (n: number) => new Intl.NumberFormat('en-UG').format(n);

/** Seedlings for one block of land on a square grid: area ÷ (spacing × spacing). */
const seedlingsFor = (acres: number, spacing: number) => Math.round((acres * SQ_M_PER_ACRE) / (spacing * spacing));

const SeedlingCalculator = () => {
  const [acres, setAcres] = useState('1');
  const [kind, setKind] = useState<Kind>('woodlot');
  const value = Number(acres.replace(',', '.'));
  const valid = acres.trim() !== '' && Number.isFinite(value) && value >= 0.1 && value <= 1000;
  const n = valid ? seedlingsFor(value, SPACING_M[kind]) : null;
  const c = en.services.calc;
  return (
    <section aria-labelledby="calc-heading" className="flex flex-col gap-4 rounded-lg bg-paper p-5 shadow-card ring-1 ring-line md:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="calc-heading" className="text-2xl">{c.heading}</h2>
        <p className="text-bark-muted">{c.intro}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field label={c.area} hint={c.areaHint} error={valid ? undefined : c.areaError}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} inputMode="decimal" value={acres} onChange={e => { setAcres(e.target.value); }} />
          )}
        </Field>
        <Field label={c.kind}>
          {({ id }) => (
            <Select id={id} value={kind} onChange={e => { setKind(e.target.value as Kind); }}>
              {(Object.keys(SPACING_M) as Kind[]).map(k => <option key={k} value={k}>{c.kinds[k]}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-forest-tint px-4 py-3">
        {n !== null && (
          <p className="flex flex-col">
            <span className="font-display text-2xl font-bold text-canopy">{c.result(count(n))}</span>
            <span className="text-sm text-bark-muted">{c.withSpare(count(Math.ceil(n * 1.1)))}</span>
          </p>
        )}
        <Button asChild>
          <Link to="/nurseries">
            {c.find}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  );
};

/** What Nursery Link can help with beyond selling seedlings: planning, planting, watering and care. */
const Services = () => {
  usePageTitle(en.services.title);
  const [params, setParams] = useSearchParams();
  const chosen = serviceTypes.find(t => t === params.get('service')) ?? null;
  const choose = (type: ServiceType) => {
    setParams({ service: type }, { replace: true, preventScrollReset: true });
    const form = document.getElementById('request');
    form?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    form?.querySelector('select')?.focus({ preventScroll: true });
  };
  return (
    <div className="flex flex-col gap-10">
      <PageHero title={en.services.title} intro={en.services.intro} photo="community-planting" focus="object-[50%_35%]" />

      <section aria-labelledby="services-list" className="flex flex-col gap-5">
        <h2 id="services-list" className="text-2xl md:text-3xl">{en.services.listHeading}</h2>
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {SERVICES.map(s => {
            const item = en.services.items[s.key];
            const img = IMAGES[s.photo];
            return (
              <li key={s.key} className="flex flex-col overflow-hidden rounded-lg bg-paper shadow-card ring-1 ring-line">
                <div className="relative aspect-[3/2] bg-forest-tint">
                  {img && <Picture src={img.src} alt="" width={480} height={320} sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw" className={cn('absolute inset-0 size-full object-cover', s.focus)} />}
                  <span className={cn('absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1', s.type ? 'bg-paper text-bark ring-line' : 'bg-seedling-tint text-canopy ring-seedling/40')}>
                    {s.type ? en.services.status.onRequest : en.services.status.now}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <h3 id={`service-${s.key}`} className="text-xl">{item.title}</h3>
                  <p className="text-bark-muted">{item.body}</p>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-sm font-bold text-bark">{en.services.includes}</p>
                    <ul className="flex flex-col gap-1 text-sm">
                      {item.points.map(p => (
                        <li key={p} className="flex gap-2">
                          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-seedling" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {s.type ? (
                    <Button variant="secondary" className="mt-auto self-start" onClick={() => { if (s.type) choose(s.type); }} aria-describedby={`service-${s.key}`}>
                      {en.services.requestThis}
                      <ArrowRight aria-hidden />
                    </Button>
                  ) : (
                    <Button asChild variant="secondary" className="mt-auto self-start">
                      <Link to="/nurseries">
                        {en.nav.nurseries}
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <RequestService chosen={chosen} titles={SERVICE_TITLES} />
        <SeedlingCalculator />
      </div>
    </div>
  );
};

export default Services;
