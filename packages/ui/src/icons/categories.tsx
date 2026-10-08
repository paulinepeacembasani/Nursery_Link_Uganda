import { CloudRain, FileBadge, HandCoins, Tag, type LucideProps } from 'lucide-react';
import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/** Line icons drawn on lucide's 24-px grid (2-px round strokes) so they sit alongside it. */
const Svg = ({ size = 24, children, ...props }: IconProps & { children: ReactNode }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...props}
  >
    {children}
  </svg>
);

/** Indigenous: a broad-crowned native tree */
export const IndigenousIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21v-7" />
    <path d="M12 14c-4.5 0-8-2.4-8-5.6C4 5.4 7.6 3 12 3s8 2.4 8 5.4C20 11.6 16.5 14 12 14Z" />
    <path d="M12 17l-3-2M12 16l3-2" />
  </Svg>
);

/** Agroforestry: a tree growing beside crop rows */
export const AgroforestryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 21v-6" />
    <circle cx="8" cy="9" r="5" />
    <path d="M15 21v-4M15 17c0-1.5 1-2.5 2.5-2.5M15 18c0-1.5-1-2.5-2.2-2.5M20 21v-4M20 17c0-1.5 1-2.5 2-2.5" />
    <path d="M3 21h19" />
  </Svg>
);

/** Exotic plantation species: a pine */
export const ExoticIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21v-4" />
    <path d="M12 3 6 10h3l-4 5h4l-3 2h12l-3-2h4l-4-5h3Z" />
  </Svg>
);

/** Ornamental: a tree in flower */
export const OrnamentalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21v-7" />
    <path d="M12 14c-4 0-7-2.2-7-5.2S8 3 12 3s7 2.8 7 5.8-3 5.2-7 5.2Z" />
    <circle cx="9" cy="8" r="1" fill="currentColor" />
    <circle cx="14.5" cy="7" r="1" fill="currentColor" />
    <circle cx="12.5" cy="10.5" r="1" fill="currentColor" />
  </Svg>
);

/** Medicinal: a leaf with a cross */
export const MedicinalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20c0-9 6-15 16-16-1 10-7 16-16 16Z" />
    <path d="M4 20 11 13" />
    <path d="M14 8v5M11.5 10.5h5" />
  </Svg>
);

/** A seedling: the brand mark and the normal map pin glyph */
export const SeedlingIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21v-9" />
    <path d="M12 12c0-4 2.5-6.5 7-7 0 4.5-2.5 7-7 7Z" />
    <path d="M12 14c0-3-2-5-6-5.5 0 3.5 2 5.5 6 5.5Z" />
  </Svg>
);

/** Coffee: a bean */
export const CoffeeIcon = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="12" rx="6.5" ry="9" transform="rotate(35 12 12)" />
    <path d="M8 18c3-2 2-5 4-6.5s3-3.5 4-5.5" />
  </Svg>
);

/** Cocoa: a ridged pod */
export const CocoaIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3c3.5 0 6 4 6 9s-2.5 9-6 9-6-4-6-9 2.5-9 6-9Z" />
    <path d="M12 3v18M9 4.5c-1 2-1.5 4.5-1.5 7.5s.5 5.5 1.5 7.5M15 4.5c1 2 1.5 4.5 1.5 7.5s-.5 5.5-1.5 7.5" />
  </Svg>
);

export const SPECIES_CATEGORY_ICONS = {
  indigenous: IndigenousIcon,
  agroforestry: AgroforestryIcon,
  exotic: ExoticIcon,
  ornamental: OrnamentalIcon,
  medicinal: MedicinalIcon,
  coffee: CoffeeIcon,
  cocoa: CocoaIcon,
} as const;

export const SpeciesCategoryIcon = ({ category, ...p }: IconProps & { category: keyof typeof SPECIES_CATEGORY_ICONS }) => {
  const Icon = SPECIES_CATEGORY_ICONS[category];
  return <Icon {...p} />;
};

export const NEWS_CATEGORY_ICONS = {
  weather: CloudRain,
  market: Tag,
  policy: FileBadge,
  grant: HandCoins,
} as const;

export const NewsCategoryIcon = ({ category, ...p }: LucideProps & { category: keyof typeof NEWS_CATEGORY_ICONS }) => {
  const Icon = NEWS_CATEGORY_ICONS[category];
  return <Icon aria-hidden {...p} />;
};
