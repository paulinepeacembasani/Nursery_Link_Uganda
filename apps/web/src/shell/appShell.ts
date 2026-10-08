import { en } from '../copy/en.ts';
import { IMAGES } from '../data/images.ts';
// The file itself, not the package entry: this runs in Node at build time, without React
import { BRAND_MARK_BODY, BRAND_MARK_VIEWBOX } from '../../../../packages/ui/src/icons/brandMarkSvg.ts';
import { PAGE_FRAME } from '../lib/layout.ts';

/**
 * The app shell: plain HTML for what a visitor sees first, painted from index.html before the app's
 * JavaScript has loaded (on a slow phone connection that takes a couple of seconds). React then
 * replaces it with the same markup, so nothing moves.
 *
 * Built at build time by the vite.config.ts plugin, from the same copy and photo data as the app.
 * The class names mirror components/Layout.tsx (Header), components/Logo.tsx and routes/Home.tsx
 * (the hero): change them together. The "shell" E2E check compares the two.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAV = [
  { to: '/nurseries', label: en.nav.nurseries },
  { to: '/free-seedlings', label: en.nav.freeSeedlings },
  { to: '/library', label: en.nav.library },
  { to: '/news', label: en.nav.news },
  { to: '/services', label: en.nav.services },
];

const MARK = `<svg width="34" height="34" viewBox="${BRAND_MARK_VIEWBOX}" aria-hidden="true" class="shrink-0 rounded-[9px] ring-1 ring-paper/15">${BRAND_MARK_BODY}</svg>`;

/** The header bar (every page). Links work before the app loads; the account area is left empty. */
const header = () =>
  `<header class="on-dark sticky top-0 z-30 bg-canopy"><div class="${PAGE_FRAME} flex h-16 items-center justify-between gap-4">` +
  `<a href="/" class="flex min-h-11 items-center gap-2.5 text-paper no-underline" aria-label="${esc(`${en.app.fullName}, ${en.app.home}`)}">${MARK}` +
  `<span class="flex flex-col leading-none"><span class="font-display text-xl font-semibold tracking-tight">${esc(en.app.name)}</span>` +
  `<span class="text-xs font-bold text-murram-light">${esc(en.footer.country)}</span></span></a>` +
  '<nav aria-label="Main" class="hidden items-center gap-1 lg:flex">' +
  NAV.map(n => `<a href="${n.to}" class="flex min-h-11 items-center gap-2 rounded-sm px-3 font-label text-label no-underline text-paper/90">${esc(n.label)}</a>`).join('') +
  '</nav><span class="size-11"></span></div></header>';

/** Home's hero: the photo, eyebrow, headline and lead (the search and links arrive with the app). */
const homeHero = () => {
  const hero = IMAGES['greenhouse-kamuli'];
  const base = '/images/greenhouse-kamuli';
  return (
    '<section class="on-dark relative isolate overflow-hidden bg-canopy">' +
    '<div class="absolute inset-x-0 top-0 -z-10 h-72 sm:h-80 md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-[62%]">' +
    `<picture class="contents"><source type="image/webp" srcset="${base}-480.webp 480w, ${base}-960.webp 960w, ${base}-1400.webp 1400w" sizes="(min-width: 768px) 62vw, 50vw">` +
    `<img src="${hero?.src ?? `${base}.jpg`}" alt="" width="1400" height="867" fetchpriority="high" decoding="async" class="size-full object-cover object-[50%_45%]"></picture>` +
    '<div aria-hidden="true" class="absolute inset-0 bg-gradient-to-t from-canopy via-canopy/30 to-canopy/10 md:bg-gradient-to-r md:from-canopy md:via-canopy/25 md:to-transparent"></div>' +
    '<div aria-hidden="true" class="absolute inset-x-0 bottom-0 hidden h-24 bg-gradient-to-t from-canopy/70 to-transparent md:block"></div></div>' +
    `<div class="${PAGE_FRAME} flex min-h-[calc(100dvh-4rem)] flex-col justify-end pt-56 pb-16 sm:pt-64 md:justify-center md:py-16"><div class="flex flex-col gap-4 md:w-[55%] lg:w-[52%] 2xl:w-[48%]">` +
    `<p class="flex items-center gap-2 self-start rounded-full bg-paper/10 px-3 py-1 text-sm font-bold text-mist ring-1 ring-paper/25"><span aria-hidden="true" class="size-2 rounded-full bg-sky"></span>${esc(en.home.eyebrow)}</p>` +
    `<h1 class="max-w-2xl text-display text-paper">${esc(en.home.title)} <span class="text-murram-light">${esc(en.home.titleAccent)}</span></h1>` +
    `<p class="max-w-lg text-base text-mist/90 md:text-lg 2xl:max-w-xl 2xl:text-xl">${esc(en.home.lead)}</p>` +
    '</div></div></section>'
  );
};

export const renderShell = () => ({ header: header(), home: homeHero() });
