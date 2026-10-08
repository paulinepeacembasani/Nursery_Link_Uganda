import { BrandMark, Button, OfflineBanner, Toaster, cn } from '@nurserylink/ui';
import {
  AlertCircle, Banknote, BarChart3, BookOpen, ClipboardList, Gift, Layers, LogOut, Map as MapIcon, Menu, MessageSquare, Newspaper, Package, ScrollText, Sprout, Truck, X, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { en } from '../copy/en';
import { useDashboard } from '../features/dashboard/api';
import { useOnline } from '../lib/online';
import { signOut, useSession } from '../lib/session';

interface Item { to: string; label: string; icon: LucideIcon }

const SECTIONS: { title?: string; items: Item[] }[] = [
  { items: [{ to: '/', label: en.nav.dashboard, icon: AlertCircle }, { to: '/insights', label: en.nav.insights, icon: BarChart3 }] },
  {
    title: en.nav.sections.catalogue,
    items: [
      { to: '/nurseries', label: en.nav.nurseries, icon: MapIcon },
      { to: '/inventory', label: en.nav.inventory, icon: Layers },
      { to: '/species', label: en.nav.species, icon: BookOpen },
      { to: '/news', label: en.nav.news, icon: Newspaper },
      { to: '/delivery-rates', label: en.nav.deliveryRates, icon: Truck },
      { to: '/campaigns', label: en.nav.campaigns, icon: Gift },
    ],
  },
  {
    title: en.nav.sections.money,
    items: [
      { to: '/orders', label: en.nav.orders, icon: Package },
      { to: '/payouts', label: en.nav.payouts, icon: Banknote },
      { to: '/service-requests', label: en.nav.serviceRequests, icon: Sprout },
    ],
  },
  {
    title: en.nav.sections.analysis,
    items: [
      { to: '/feedback', label: en.nav.feedback, icon: MessageSquare },
      { to: '/shadow', label: en.nav.shadow, icon: ClipboardList },
      { to: '/audit-log', label: en.nav.audit, icon: ScrollText },
    ],
  },
];

const link = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative flex min-h-9 items-center gap-2.5 rounded-md px-3 text-sm font-bold no-underline transition-colors',
    // The active section: a lighter row with a murram bar on its left edge
    isActive
      ? 'bg-paper/12 text-paper before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-murram-light'
      : 'text-paper/90 hover:bg-paper/8 hover:text-paper'
  );

/** A woven band (murram, sun, leaf, canopy), as on the public site's footer. */
const WovenBand = () => (
  <div
    aria-hidden
    className="h-1.5 shrink-0 rounded-full"
    style={{ background: 'repeating-linear-gradient(90deg, var(--color-murram) 0 18px, var(--color-sun) 18px 23px, var(--color-seedling) 23px 41px, var(--color-forest) 41px 46px)' }}
  />
);

const Brand = () => (
  <div className="flex items-center gap-2.5 px-2 py-2 text-paper">
    <BrandMark size={34} className="shrink-0 rounded-[9px] ring-1 ring-paper/15" />
    <span className="font-display text-lg font-semibold tracking-tight">{en.app.shortName}</span>
  </div>
);

const initials = (name: string | undefined) =>
  (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('') || '?';

/** The sections, the signed-in admin, and Sign out (in the sidebar, or the menu on narrow screens). */
const Sidebar = ({ name }: { name: string | undefined }) => {
  // New orders waiting for dispatch, so they're seen from every page
  const toDispatch = useDashboard().data?.orders_to_dispatch.count ?? 0;
  return (
  <>
    <nav aria-label="Admin" className="flex flex-1 flex-col gap-3">
      {SECTIONS.map((section, i) => (
        <div key={section.title ?? i} className="flex flex-col gap-0.5">
          {section.title && <p className="px-3 pb-1 text-xs font-bold text-paper/85">{section.title}</p>}
          {section.items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={link}>
              <Icon aria-hidden className="size-4" />
              {label}
              {to === '/orders' && toDispatch > 0 && (
                <span className="ml-auto rounded-full bg-murram-light px-2 py-0.5 text-xs leading-none text-canopy tabular-nums">
                  {toDispatch}
                  <span className="sr-only"> {en.nav.toDispatch}</span>
                </span>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
    <div className="flex flex-col gap-2 pt-1">
      <WovenBand />
      <p className="flex items-center gap-2 px-2 pt-1 text-sm text-paper">
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-murram text-xs font-bold text-paper">{initials(name)}</span>
        <span className="truncate font-bold">{name}</span>
      </p>
      <Button variant="ghost" size="sm" className="justify-start text-paper hover:bg-paper/10" onClick={() => { void signOut(); }}>
        <LogOut aria-hidden />
        {en.nav.signOut}
      </Button>
    </div>
  </>
  );
};

/** Dense, desktop-first frame: a left sidebar and a wide work area; a top bar and menu below 1024 px. */
export const AdminLayout = () => {
  const { user } = useSession();
  const online = useOnline();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  // Close the menu on navigation and with Escape
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); setMenuOpen(false); }
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  return (
    <div className="flex min-h-dvh flex-col text-sm lg:flex-row">
      <a href="#main" className="sr-only z-50 bg-paper p-3 font-bold focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {en.app.skipToContent}
      </a>
      {/* Narrow screens: a top bar with a menu */}
      <header className="on-dark sticky top-0 z-30 flex items-center justify-between bg-canopy px-2 lg:hidden">
        <Brand />
        <Button variant="ghost" size="icon" className="text-paper hover:bg-paper/10" aria-expanded={menuOpen} aria-controls="admin-menu" aria-label={menuOpen ? en.nav.closeMenu : en.nav.menu} onClick={() => { setMenuOpen(o => !o); }}>
          {menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
        </Button>
      </header>
      {menuOpen && (
        <div id="admin-menu" className="on-dark fixed inset-x-0 top-[52px] bottom-0 z-30 flex flex-col gap-4 overflow-y-auto bg-canopy p-3 lg:hidden">
          <Sidebar name={user?.full_name} />
        </div>
      )}
      {/* Wide screens: the column stretches with the page (so the colour does too); the sidebar itself stays in view */}
      <div className="hidden w-60 shrink-0 bg-canopy lg:block">
        <aside className="on-dark sticky top-0 flex h-dvh flex-col gap-4 overflow-y-auto bg-canopy p-3">
          <Brand />
          {!menuOpen && <Sidebar name={user?.full_name} />}
        </aside>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {!online && <OfflineBanner>{en.states.offline}</OfflineBanner>}
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-5 outline-none lg:px-6 lg:py-6">
          <Outlet />
        </main>
      </div>
      <Toaster />
      <ScrollRestoration />
    </div>
  );
};
