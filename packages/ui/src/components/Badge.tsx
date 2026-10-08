import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const badgeStyles = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold [&_svg]:size-4', {
  variants: {
    tone: {
      neutral: 'bg-mist text-bark ring-1 ring-line',
      positive: 'bg-seedling-tint text-canopy',
      // Sun is reserved for free seedlings (FR-17): always Canopy text and outline
      gift: 'bg-sun text-bark ring-1 ring-canopy',
      // Stale stock: outlined amber with a clock icon, never filled yellow
      stale: 'bg-amber-tint text-amber ring-1 ring-amber',
      danger: 'bg-laterite-tint text-laterite',
      info: 'bg-forest-tint text-forest',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeStyles>;

export const Badge = ({ className, tone, ...props }: BadgeProps) => <span className={cn(badgeStyles({ tone }), className)} {...props} />;
