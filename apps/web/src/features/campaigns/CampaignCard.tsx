import { StockMeter, formatDate } from '@nurserylink/ui';
import { Link } from 'react-router';
import { en } from '../../copy/en';
import type { Campaign } from './api';
import { FunderBadge } from './FunderBadge';

/** A campaign teaser. The Sun band and "Free seedlings" label mark it as free seedlings (FR-17). */
export const CampaignCard = ({ c, detailed = false }: { c: Campaign; detailed?: boolean }) => (
  <Link
    to={`/free-seedlings/${c.id}`}
    className="group flex h-full flex-col overflow-hidden rounded-lg bg-paper no-underline shadow-card ring-1 ring-line transition-shadow hover:shadow-lift"
  >
    <span aria-hidden className="h-1.5 bg-sun" />
    <span className="flex flex-1 flex-col gap-3 p-4">
      <span className="self-start rounded-full bg-sun px-2.5 py-0.5 text-xs font-bold text-bark ring-1 ring-canopy">{en.home.modules.free}</span>
      <span className="font-display text-xl leading-snug font-semibold text-canopy group-hover:underline">{c.title}</span>
      {detailed && (
        <span className="flex flex-wrap items-center gap-2 text-sm text-bark-muted">
          <FunderBadge type={c.funder_type} />
          {en.freeSeedlings.fundedBy(c.funder_name)}
        </span>
      )}
      {detailed && <span className="text-sm text-bark">{c.purpose} · {en.freeSeedlings.closes(formatDate(c.ends_at))}</span>}
      <span className="text-sm text-bark-muted">{en.home.pickup(`${c.pickup_nursery.name}, ${c.sub_county.name}`)}</span>
      <span className="mt-auto flex flex-col gap-1.5">
        <StockMeter remaining={c.remaining_stock} total={c.allocated_stock} label={`${c.title}: ${en.home.left(c.remaining_pct)}`} />
        <span className="text-sm font-bold text-bark">{en.home.left(c.remaining_pct)}</span>
      </span>
    </span>
  </Link>
);
