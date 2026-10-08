import { Button, Skeleton } from '@nurserylink/ui';
import { ArrowRight, ChevronDown, ChevronRight, LocateFixed, MessageSquare, Search } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Combobox } from '../components/Combobox';
import { Picture } from '../components/Picture';
import { usePageTitle } from '../components/usePageTitle';
import { en } from '../copy/en';
import { IMAGES } from '../data/images';
import { useCampaigns } from '../features/campaigns/api';
import { CampaignCard } from '../features/campaigns/CampaignCard';
import { useNewsList } from '../features/news/api';
import { NewsCard } from '../features/news/NewsCard';
import { useFeatures } from '../features/orders/api';
import { useSiteSettings } from '../features/feedback/api';
import { useUserLocation } from '../features/nurseries/location';
import { useSuggestions, type Suggestion } from '../features/search/api';
import { suggestionOption } from '../features/search/options';
import { PAGE_FRAME } from '../lib/layout';
import { useDebounced } from '../lib/useDebounced';
import { haversineKm } from '../lib/geo';

/** The four modules, each shown with a real photo from Uganda (decorative: the title names the link). */
const MODULES = [
  { to: '/nurseries', label: en.home.modules.nurseries, hint: en.home.modules.nurseriesHint, photo: 'nurseryman-kapchorwa', w: 800, h: 1200, focus: 'object-[50%_18%]' },
  { to: '/free-seedlings', label: en.home.modules.free, hint: en.home.modules.freeHint, photo: 'community-planting', w: 960, h: 641, focus: 'object-[60%_40%]', gift: true },
  { to: '/library', label: en.home.modules.library, hint: en.home.modules.libraryHint, photo: 'mabira-forest', w: 960, h: 720, focus: 'object-center' },
  { to: '/news', label: en.home.modules.news, hint: en.home.modules.newsHint, photo: 'western-hills', w: 960, h: 542, focus: 'object-center' },
] as const;

const Container = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`${PAGE_FRAME} ${className}`}>{children}</div>
);

/**
 * One "page" of Home: each section gets the whole screen from tablet width up (less on phones, where
 * a full screen per section would mean a lot of scrolling past empty space), so nothing is crowded.
 */
const SCREEN = 'flex flex-col justify-center py-16 md:min-h-[calc(100dvh-4rem)] md:py-24';

const SectionHeading = ({ id, title, to, intro }: { id: string; title: string; to: string; intro?: string }) => (
  <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
    <div className="flex max-w-2xl flex-col gap-3">
      <h2 id={id} className="text-h2">
        {title}
        <span aria-hidden className="mt-3 block h-1 w-12 rounded-full bg-murram" />
      </h2>
      {intro && <p className="text-lg text-bark-muted">{intro}</p>}
    </div>
    <Link to={to} className="flex min-h-11 items-center gap-1 font-bold no-underline hover:underline">
      {en.home.seeAll}
      <ChevronRight aria-hidden className="size-4" />
    </Link>
  </div>
);

/**
 * Home, one screen at a time: the photo hero with the search; the four modules as photo cards; how
 * it works; free seedlings; the latest advice; and an invitation to help shape the site.
 */
const Home = () => {
  usePageTitle();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { position } = useUserLocation();
  const campaigns = useCampaigns(6);
  const news = useNewsList(null, 1, 3);
  const features = useFeatures();
  const site = useSiteSettings();

  // Nearest pickup points first when we already know where the user is
  const nearby = useMemo(() => {
    const list = campaigns.data?.data.filter(c => c.is_open) ?? [];
    return position ? [...list].sort((a, b) => haversineKm(position, a.pickup_nursery.location) - haversineKm(position, b.pickup_nursery.location)) : list;
  }, [campaigns.data, position]);

  const typed = useDebounced(q.trim(), 200);
  const suggestions = useSuggestions(typed, ['species', 'nursery', 'place']);
  const suggested = typed.length >= 2 && q.trim().length >= 2 ? (suggestions.data?.data ?? []) : [];
  const go = (s: Suggestion) => {
    const to =
      s.kind === 'species' ? `/nurseries?q=${encodeURIComponent(s.label)}`
      : s.kind === 'nursery' ? `/nurseries?nursery=${s.id}`
      : s.level === 'district' ? `/nurseries?district=${s.id}`
      : `/nurseries?district=${s.parent_id ?? ''}&sub_county=${s.id}`;
    void navigate(to);
  };

  const search = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    void navigate(term ? `/nurseries?q=${encodeURIComponent(term)}` : '/nurseries');
  };

  const hero = IMAGES['greenhouse-kamuli'];
  const truck = IMAGES['seedlings-offloading'];

  return (
    <div className="flex flex-col">
      {/* Hero: a big shade-net tree nursery in Kamuli, under a canopy-green wash where the text sits */}
      <section aria-labelledby="home-title" className="on-dark relative isolate overflow-hidden bg-canopy">
        {/* Phones: the photo across the top, fading into green. Wider: the photo fills the right side. */}
        <div className="absolute inset-x-0 top-0 -z-10 h-72 sm:h-80 md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-[62%]">
          {hero && (
            <Picture
              src={hero.src}
              alt=""
              width={1400}
              height={867}
              priority
              wide
              sizes="(min-width: 768px) 62vw, 50vw"
              className="size-full object-cover object-[50%_45%]"
            />
          )}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-canopy via-canopy/30 to-canopy/10 md:bg-gradient-to-r md:from-canopy md:via-canopy/25 md:to-transparent" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 hidden h-24 bg-gradient-to-t from-canopy/70 to-transparent md:block" />
        </div>
        <Container className="flex min-h-[calc(100dvh-4rem)] flex-col justify-end pt-56 pb-16 sm:pt-64 md:justify-center md:py-16">
          {/* The copy keeps to the left, over the dark side of the photo's gradient */}
          <div className="flex flex-col gap-4 md:w-[55%] lg:w-[52%] 2xl:w-[48%]">
          <p className="flex items-center gap-2 self-start rounded-full bg-paper/10 px-3 py-1 text-sm font-bold text-mist ring-1 ring-paper/25">
            <span aria-hidden className="size-2 rounded-full bg-sky" />
            {en.home.eyebrow}
          </p>
          <h1 id="home-title" className="max-w-2xl text-display text-paper">
            {en.home.title} <span className="text-murram-light">{en.home.titleAccent}</span>
          </h1>
          <p className="max-w-lg text-base text-mist/90 md:text-lg 2xl:max-w-xl 2xl:text-xl">{en.home.lead}</p>
          <form role="search" onSubmit={search} className="flex max-w-xl flex-col 2xl:max-w-2xl gap-2 rounded-lg bg-paper/10 p-2 ring-1 ring-paper/20 backdrop-blur-sm sm:flex-row">
            <Combobox
              id="home-search"
              label={en.home.searchLabel}
              value={q}
              onChange={setQ}
              placeholder={en.home.searchPlaceholder}
              options={suggested.map(suggestionOption)}
              onSelect={i => { const s = suggested[i]; if (s) go(s); }}
              className="flex-1"
              leading={<Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-bark-muted" />}
              inputClassName="rounded-md border-0 bg-mist pr-3 pl-11"
            />
            <Button type="submit" variant="accent" className="min-h-12">{en.home.search}</Button>
          </form>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
            <Button asChild variant="onDark" size="sm" className="min-h-11">
              <Link to="/nurseries?sort=nearest">
                <LocateFixed aria-hidden />
                {en.home.useLocation}
              </Link>
            </Button>
            <span className="ml-1 text-mist/90">{en.home.popular}</span>
            <ul className="flex flex-wrap gap-1.5">
              {en.home.popularTrees.map(t => (
                <li key={t}>
                  <Link to={`/nurseries?q=${encodeURIComponent(t)}`} className="inline-flex min-h-11 items-center rounded-full bg-paper/12 px-3.5 font-bold text-paper no-underline ring-1 ring-paper/25 hover:bg-paper/20">
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          </div>
        </Container>
        <a href="#home-modules" className="absolute bottom-3 left-1/2 hidden size-11 -translate-x-1/2 items-center justify-center rounded-full text-paper/90 no-underline ring-1 ring-paper/40 hover:bg-paper/10 md:flex" aria-label={en.home.scrollDown}>
          <ChevronDown aria-hidden className="size-6" />
        </a>
      </section>

      {/* Page 2: the four modules as photo cards, with room to breathe, on a wash of Lake Victoria sky */}
      <section aria-labelledby="home-modules" className={`scroll-mt-16 bg-gradient-to-b from-sky-tint to-mist ${SCREEN}`}>
        <Container className="flex flex-col gap-8 md:gap-10">
          <div className="flex max-w-2xl flex-col gap-3">
            <h2 id="home-modules" className="text-h2">
              {en.home.modulesHeading}
              <span aria-hidden className="mt-3 block h-1 w-12 rounded-full bg-murram" />
            </h2>
            <p className="text-lg text-bark-muted">{en.home.modulesIntro}</p>
          </div>
          <nav aria-label={en.home.modulesHeading}>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
              {MODULES.map(m => {
                const img = IMAGES[m.photo];
                return (
                  <li key={m.to}>
                    <Link
                      to={m.to}
                      className="group relative flex aspect-[16/10] flex-col justify-end overflow-hidden rounded-lg bg-canopy no-underline shadow-card transition-shadow hover:shadow-lift sm:aspect-[4/3] xl:aspect-[3/4]"
                    >
                      {img && (
                        <Picture
                          src={img.src}
                          alt=""
                          width={m.w}
                          height={m.h}
                          sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                          className={`absolute inset-0 size-full object-cover ${m.focus} transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100`}
                        />
                      )}
                      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-canopy via-canopy/55 to-transparent" />
                      {'gift' in m && (
                        <span className="absolute top-3 left-3 rounded-full bg-sun px-2.5 py-0.5 text-xs font-bold text-bark ring-1 ring-canopy">{en.home.freeBadge}</span>
                      )}
                      <span className="relative flex flex-col gap-1 p-4 md:p-6">
                        <span className="flex items-center justify-between gap-2 font-display text-2xl leading-tight font-semibold text-paper">
                          {m.label}
                          <ArrowRight aria-hidden className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                        </span>
                        <span className="text-mist/90">{m.hint}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </Container>
      </section>

      {/* Page 3: how it works, Ugandan reality (mobile money, boda boda), with the photo to match */}
      <section aria-labelledby="home-steps" className={`bg-sky-tint ${SCREEN}`}>
        <Container className="grid items-center gap-10 md:grid-cols-[1fr_20rem] lg:grid-cols-[1fr_24rem]">
          <div className="flex flex-col gap-8">
            <h2 id="home-steps" className="max-w-xl text-h2">
              {en.home.stepsHeading}
              <span aria-hidden className="mt-3 block h-1 w-12 rounded-full bg-murram" />
            </h2>
            <ol className="grid gap-6 md:grid-cols-3">
              {(features.data?.payments === false ? [en.home.steps[0], en.home.stepTrial, en.home.steps[2]] : en.home.steps).map((step, i) => (
                <li key={step.title} className="flex flex-col gap-2">
                  <span aria-hidden className="font-stat text-stat text-murram">{i + 1}</span>
                  <h3 className="text-lg">{step.title}</h3>
                  <p className="text-bark-muted">{step.body}</p>
                </li>
              ))}
            </ol>
            <Button asChild className="self-start" size="lg">
              <Link to="/nurseries">
                {en.home.stepsCta}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          {truck && (
            <figure className="relative hidden overflow-hidden rounded-lg shadow-lift ring-4 ring-paper md:block">
              <Picture src={truck.src} alt={en.home.stepsPhotoAlt} width={1024} height={576} sizes="24rem" className="aspect-[4/5] w-full object-cover object-[45%_50%]" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-canopy/90 to-transparent p-4 pt-10 text-sm font-bold text-paper">{en.home.stepsPhotoCaption}</figcaption>
            </figure>
          )}
        </Container>
      </section>

      {/* Page 4: free seedlings, nearest pickup first when we know where the user is */}
      <section aria-labelledby="home-campaigns" className={`bg-sun-tint/60 ${SCREEN}`}>
        {/* min-w-0: the scrolling strip must not widen the page */}
        <Container className="flex min-w-0 flex-col gap-8">
          <SectionHeading id="home-campaigns" title={position ? en.home.campaignsHeading : en.home.campaignsHeadingAll} intro={en.home.campaignsIntro} to="/free-seedlings" />
          {campaigns.isPending && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="hidden h-48 lg:block" /></div>}
          {campaigns.data && nearby.length === 0 && <p className="text-lg text-bark-muted">{en.home.campaignsEmpty}</p>}
          {nearby.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {nearby.slice(0, 6).map(c => (
                <li key={c.id} className="min-w-0">
                  <CampaignCard c={c} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </section>

      {/* Page 5: the latest advice */}
      <section aria-labelledby="home-news" className={SCREEN}>
        <Container className="flex min-w-0 flex-col gap-8">
          <SectionHeading id="home-news" title={en.home.newsHeading} intro={en.home.newsIntro} to="/news" />
          {news.isPending && <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>}
          {news.data?.data.length === 0 && <p className="text-lg text-bark-muted">{en.home.newsEmpty}</p>}
          {news.data && news.data.data.length > 0 && <ul className="grid gap-4 md:grid-cols-3 md:gap-6">{news.data.data.map(p => <NewsCard key={p.id} post={p} />)}</ul>}
        </Container>
      </section>

      {/* Page 6: help shape the site (feedback, and the survey when there is one) */}
      <section aria-labelledby="home-shape" className="on-dark bg-canopy py-16 md:py-24">
        <Container className="flex flex-col items-start gap-5 md:max-w-3xl">
          <h2 id="home-shape" className="text-h2 text-paper">
            {en.home.shapeHeading}
            <span aria-hidden className="mt-3 block h-1 w-12 rounded-full bg-murram-light" />
          </h2>
          <p className="text-lg text-mist/90">{en.home.shapeBody}</p>
          <div className="flex flex-wrap gap-3">
            {site.data?.survey_url && (
              <Button asChild variant="accent" size="lg"><Link to="/survey">{en.welcome.takeSurvey}</Link></Button>
            )}
            <Button asChild variant="onDark" size="lg">
              <Link to="/feedback?from=%2F">
                <MessageSquare aria-hidden />
                {en.footer.feedback}
              </Link>
            </Button>
          </div>
        </Container>
      </section>
    </div>
  );
};
export default Home;
