import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-sans font-bold no-underline transition-colors select-none disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-forest text-paper hover:bg-canopy',
        // Murram: the one standout action on a dark or photo background (white on murram 5:1)
        accent: 'bg-murram text-paper shadow-card hover:bg-[color-mix(in_srgb,var(--color-murram),black_14%)]',
        // Light outline for dark or photo backgrounds
        onDark: 'border border-paper/70 text-paper hover:bg-paper/10',
        secondary: 'border border-forest bg-paper text-forest hover:bg-forest-tint',
        ghost: 'text-forest hover:bg-forest-tint',
        danger: 'bg-laterite text-paper hover:bg-[color-mix(in_srgb,var(--color-laterite),black_15%)]',
        gift: 'border-2 border-canopy bg-sun text-bark hover:bg-[color-mix(in_srgb,var(--color-sun),black_8%)]',
      },
      size: {
        // 44 px minimum tap target on the public site; admin uses the denser "sm"
        md: 'min-h-11 px-4 text-base',
        lg: 'min-h-13 px-5 text-lg',
        sm: 'min-h-9 px-3 text-sm',
        icon: 'size-11',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  /** Render the child (e.g. a router Link) with button styles */
  asChild?: boolean;
  /** Shows the button as busy and disables it while a request is in flight */
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild = false, busy = false, disabled, children, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonStyles({ variant, size, block }), className)}
        disabled={asChild ? undefined : disabled || busy}
        aria-busy={busy || undefined}
        {...(asChild ? {} : { type: type ?? 'button' })}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);
Button.displayName = 'Button';
