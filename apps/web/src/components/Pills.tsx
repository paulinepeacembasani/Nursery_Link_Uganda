import type { Schemas } from '@nurserylink/api-client';
import type { SpeciesCategory } from '@nurserylink/shared';
import { cn } from '@nurserylink/ui';
import { en } from '../copy/en';

type NewsCategory = Schemas['NewsListItem']['category'];

// Category colours (all pairs pass WCAG AA), so lists scan at a glance without icons
const DARK_MURRAM = 'text-[color-mix(in_srgb,var(--color-murram),black_25%)]';
const SPECIES: Record<SpeciesCategory, string> = {
  indigenous: 'bg-forest-tint text-forest',
  agroforestry: 'bg-seedling-tint text-canopy',
  exotic: 'bg-sand text-bark',
  ornamental: `bg-murram-tint ${DARK_MURRAM}`,
  medicinal: 'bg-paper text-forest ring-1 ring-line',
  coffee: 'bg-bark text-paper',
  cocoa: `bg-sand ${DARK_MURRAM}`,
};
const NEWS: Record<NewsCategory, string> = {
  weather: 'bg-sky-tint text-lake',
  market: `bg-murram-tint ${DARK_MURRAM}`,
  policy: 'bg-sand text-bark',
  grant: 'bg-sun-tint text-canopy',
};

const pill = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap';

export const SpeciesPill = ({ category, className }: { category: SpeciesCategory; className?: string }) => (
  <span className={cn(pill, SPECIES[category], className)}>{en.categories[category]}</span>
);

export const NewsPill = ({ category, className }: { category: NewsCategory; className?: string }) => (
  <span className={cn(pill, NEWS[category], className)}>{en.news.categories[category]}</span>
);
