/**
 * Map pins as SVG strings, for Leaflet divIcons (Leaflet takes HTML, not React elements).
 * Normal: Forest teardrop with a seedling. Gift: Sun teardrop with a gift box, slightly larger
 * (FR-17). Selected: Canopy fill with a white ring, raised. All outlined in Canopy.
 */

export type PinKind = 'normal' | 'gift';

const CANOPY = '#1b6e44';
const FOREST = '#1d7647';
const SUN = '#f2b705';
const PAPER = '#ffffff';

const SEEDLING = '<path d="M16 25v-8m0 0c0-3.6 2.2-5.8 6.2-6.2 0 4-2.2 6.2-6.2 6.2Zm0 2c0-2.7-1.8-4.5-5.3-4.9 0 3.1 1.8 4.9 5.3 4.9Z" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
const GIFT = '<g fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9.5" y="14" width="13" height="10" rx="1"/><path d="M8.5 11h15v3h-15zM16 11v13M16 11c-1.5-3.5-5-3.5-5-1.2 0 1.2 2.6 1.2 5 1.2Zm0 0c1.5-3.5 5-3.5 5-1.2 0 1.2-2.6 1.2-5 1.2Z"/></g>';

export interface PinSize {
  width: number;
  height: number;
  /** Pixel offset of the point that sits on the map location (the teardrop tip) */
  anchor: [number, number];
}

/**
 * `base` scales the whole pin: 1 for a single pin on a small map (delivery point, location picker),
 * MAP_PIN_SCALE on the nursery map, where many pins share the view and must not hide each other.
 */
export const MAP_PIN_SCALE = 0.62;

export const pinSize = (kind: PinKind, selected = false, base = 1): PinSize => {
  const scale = base * (kind === 'gift' ? 1.15 : 1) * (selected ? 1.25 : 1);
  const width = Math.round(32 * scale);
  const height = Math.round(42 * scale);
  return { width, height, anchor: [width / 2, height] };
};

export const nurseryPinSvg = (kind: PinKind, selected = false, base = 1): string => {
  const { width, height } = pinSize(kind, selected, base);
  const fill = selected ? CANOPY : kind === 'gift' ? SUN : FOREST;
  const glyph = kind === 'gift' && !selected ? CANOPY : PAPER;
  const ring = selected ? `<circle cx="16" cy="16" r="13.5" fill="none" stroke="${PAPER}" stroke-width="1.5"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 32 42" aria-hidden="true">
<path d="M16 41C16 41 2 25.5 2 16a14 14 0 0 1 28 0c0 9.5-14 25-14 25Z" fill="${fill}" stroke="${CANOPY}" stroke-width="2"/>${ring}
<g stroke="${glyph}">${kind === 'gift' ? GIFT : SEEDLING}</g></svg>`;
};

/** A cluster: Forest disc with the count; a Sun badge when it contains a free-seedlings nursery. */
export const clusterSize = (count: number): number => (count < 10 ? 32 : count < 100 ? 38 : 44);

export const clusterPinSvg = (count: number, hasGift: boolean): string => {
  const size = clusterSize(count);
  const r = size / 2 - 2;
  const label = count > 999 ? `${String(Math.floor(count / 1000))}k` : String(count);
  const badge = hasGift
    ? `<circle cx="${String(size - 7)}" cy="7" r="6" fill="${SUN}" stroke="${CANOPY}" stroke-width="2"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(size)}" height="${String(size)}" viewBox="0 0 ${String(size)} ${String(size)}" aria-hidden="true">
<circle cx="${String(size / 2)}" cy="${String(size / 2)}" r="${String(r)}" fill="${FOREST}" stroke="${PAPER}" stroke-width="3"/>
<circle cx="${String(size / 2)}" cy="${String(size / 2)}" r="${String(r + 1.5)}" fill="none" stroke="${CANOPY}" stroke-width="1"/>
<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Open Sans, system-ui, sans-serif" font-weight="700" font-size="${count < 100 ? '14' : '13'}" fill="${PAPER}">${label}</text>${badge}</svg>`;
};

/** Accessible name for a pin, e.g. "Mukono Town Nursery, 4.2 km by road, free seedlings available". */
export const pinLabel = (name: string, opts: { distance?: string | undefined; gift?: boolean; selected?: boolean }): string =>
  [name, opts.distance, opts.gift ? 'free seedlings available' : undefined, opts.selected ? 'selected' : undefined].filter(Boolean).join(', ');
