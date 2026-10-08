import { Button, OfflineBanner, cn } from '@nurserylink/ui';
import { BookOpen, Gift, LogIn, LogOut, Map as MapIcon, Menu, Newspaper, Package, Sprout, type LucideIcon } from 'lucide-react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useMatches } from 'react-router';
import { en } from '../copy/en';
import { PAGE_FRAME } from '../lib/layout';
import { useOnline } from '../lib/online';
import { signOut, useSession } from '../lib/session';
import { useSiteSettings } from '../features/feedback/api';
import { Logo } from './Logo';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { to: '/nurseries', label: en.nav.nurseries, icon: MapIcon },
  { to: '/free-seedlings', label: en.nav.freeSeedlings, icon: Gift },
  { to: '/library', label: en.nav.library, icon: BookOpen },
  { to: '/news', label: en.nav.news, icon: Newspaper },
  { to: '/services', label: en.nav.services, icon: Sprout },
];

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-h-11 items-center gap-2 rounded-sm px-3 font-label text-label no-underline',
    isActive ? 'bg-paper/10 text-paper underline decoration-murram-light decoration-[3px] underline-offset-8' : 'text-paper/90 hover:bg-paper/10 hover:text-paper'
  );

const AccountLinks = ({ onNavigate, mobile = false }: { onNavigate?: () => void; mobile?: boolean }) => {
  const { user, restoring } = useSession();
  const location = useLocation();
  if (restoring) return <span className="min-h-11 w-24" aria-hidden />;
  if (!user) {
    return (
      <Link
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-2 rounded-sm border border-paper/60 px-3 font-label text-label text-paper no-underline hover:bg-paper/10"
      >
        <LogIn aria-hidden className="size-5" />
        {en.nav.signIn}
      </Link>
    );
  }
  return (
    <div className={cn('flex items-center gap-1', mobile && 'flex-col items-stretch')}>
      {user.role === 'buyer' && (
        <NavLink to="/orders" className={navLink} onClick={onNavigate}>
          <Package aria-hidden className="size-5" />
          {en.nav.orders}
        </NavLink>
      )}
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          void signOut();
        }}
        className="flex min-h-11 items-center gap-2 rounded-sm px-3 font-label text-label text-paper/90 hover:bg-paper/10"
      >
        <LogOut aria-hidden className="size-5" />
        {en.nav.signOut}
      </button>
    </div>
  );
};

const AppToaster = lazy(() => import('./AppToaster'));
// The first-visit notice (sample data, survey): its dialog code loads after the first render
const WelcomeNotice = lazy(() => import('../features/feedback/WelcomeNotice'));

// The menu's dialog code loads on the first tap, not with the page (one less thing on a slow first load)
const MobileMenuDialog = lazy(() => import('./MobileMenu'));

const MobileMenu = () => {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="text-paper hover:bg-paper/10 lg:hidden"
        aria-label={en.app.menu}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setLoaded(true); setOpen(true); }}
      >
        <Menu aria-hidden />
      </Button>
      {loaded && (
        <Suspense fallback={null}>
          <MobileMenuDialog open={open} onOpenChange={setOpen} nav={NAV} account={<AccountLinks onNavigate={() => { setOpen(false); }} mobile />} navLink={navLink} />
        </Suspense>
      )}
    </>
  );
};

export const Header = () => (
  <header className="on-dark sticky top-0 z-30 bg-canopy">
    <div className={cn(PAGE_FRAME, 'flex h-16 items-center justify-between gap-4')}>
      <Logo />
      <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
        {NAV.map(({ to, label }) => (
          <NavLink key={to} to={to} className={navLink}>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="flex items-center gap-1">
        <div className="hidden lg:block">
          <AccountLinks />
        </div>
        <MobileMenu />
      </div>
    </div>
  </header>
);

/** A woven band (murram, sun, leaf, canopy), after the patterns of Ugandan baskets and bark cloth. */
const WovenBand = () => (
  <div
    aria-hidden
    className="h-2"
    style={{ background: 'repeating-linear-gradient(90deg, var(--color-murram) 0 28px, var(--color-sun) 28px 36px, var(--color-seedling) 36px 64px, var(--color-lake) 64px 72px, var(--color-sky) 72px 80px)' }}
  />
);

const footerLink = 'min-h-11 py-2.5 text-mist/90 underline decoration-mist/30 underline-offset-4 hover:text-paper hover:decoration-paper md:min-h-0 md:py-1';

export const Footer = () => {
  const site = useSiteSettings();
  const { pathname } = useLocation();
  return (
  <footer className="on-dark bg-canopy pb-[env(safe-area-inset-bottom)] text-mist">
    <WovenBand />
    <div className={cn(PAGE_FRAME, 'grid gap-8 py-10 md:grid-cols-[1.4fr_1fr_1fr]')}>
      <div className="flex flex-col gap-3">
        <Logo />
        <p className="max-w-sm text-sm text-mist/85">{en.footer.tagline}</p>
      </div>
      <nav aria-label={en.footer.explore} className="flex flex-col gap-1 text-sm">
        <p className="mb-1 font-bold text-paper">{en.footer.explore}</p>
        {NAV.map(({ to, label }) => (
          <Link key={to} to={to} className="min-h-11 py-2.5 text-mist/90 underline decoration-mist/30 underline-offset-4 hover:text-paper hover:decoration-paper md:min-h-0 md:py-1">{label}</Link>
        ))}
      </nav>
      <div className="flex flex-col gap-1 text-sm">
        <p className="mb-1 font-bold text-paper">{en.footer.about}</p>
        <p className="text-mist/85">{en.footer.pilot}</p>
        {site.data?.demo_notice && <p className="text-mist/85">{en.footer.sampleData}</p>}
        <Link to={`/feedback?from=${encodeURIComponent(pathname)}`} className={footerLink}>{en.footer.feedback}</Link>
        {site.data?.survey_url && <Link to="/survey" className={footerLink}>{en.footer.survey}</Link>}
        <Link to="/credits" className={footerLink}>{en.footer.credits}</Link>
        <p className="text-mist/90">{en.footer.mapData}</p>
      </div>
    </div>
  </footer>
  );
};

/** Shared page frame. `fullBleed` pages (the map) manage their own width and have no footer. */
export const Layout = ({ children }: { children?: ReactNode }) => {
  const online = useOnline();
  // Routes set handle: { fullBleed: true } (the map: whole screen, no footer) or { bare: true }
  // (Home: edge-to-edge sections that manage their own width, with the footer)
  const handles = useMatches().map(m => (m.handle ?? {}) as { fullBleed?: boolean; bare?: boolean });
  const fullBleed = handles.some(h => h.fullBleed === true);
  const bare = fullBleed || handles.some(h => h.bare === true);
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <a href="#main" className="sr-only z-50 bg-paper p-3 font-bold focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {en.app.skipToContent}
      </a>
      <Header />
      {!online && <OfflineBanner>{en.offline.banner}</OfflineBanner>}
      <main id="main" tabIndex={-1} className={cn('flex-1 outline-none', !bare && cn(PAGE_FRAME, 'py-6 md:py-8'))}>
        {children ?? <Outlet />}
      </main>
      {!fullBleed && <Footer />}
      {/* Loads after the first render; toasts raised before then wait in their store */}
      <Suspense fallback={null}><AppToaster /></Suspense>
      <Suspense fallback={null}><WelcomeNotice /></Suspense>
      <ScrollRestoration />
    </div>
  );
};
