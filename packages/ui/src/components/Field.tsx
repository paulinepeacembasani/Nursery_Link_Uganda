import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const control =
  'block w-full rounded-sm border border-field bg-paper px-3 font-sans text-base text-bark placeholder:text-bark-muted aria-[invalid=true]:border-laterite aria-[invalid=true]:bg-laterite-tint/40 disabled:bg-mist';

export interface FieldProps {
  label: ReactNode;
  /** Shown under the label: format help, e.g. "07XX XXX XXX" */
  hint?: ReactNode;
  /** Inline validation message, shown next to the field */
  error?: string | undefined;
  /** Visually hide the label (still read by screen readers) */
  hideLabel?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Label, hint and error wired to one control with the right ids and aria attributes. */
export const Field = ({ label, hint, error, hideLabel, className, children }: FieldProps) => {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className={cn('font-label text-label text-bark', hideLabel && 'sr-only')}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-bark-muted">
          {hint}
        </p>
      )}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error && (
        <p id={errorId} className="text-sm font-bold text-laterite" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => <input ref={ref} aria-invalid={invalid || undefined} className={cn(control, 'min-h-11', className)} {...props} />
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(control, 'min-h-24 py-2', className)} {...props} />
);
Textarea.displayName = 'Textarea';

/** A native select: the phone's own picker is the most familiar and the lightest on low-end Android. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  ({ className, invalid, children, ...props }, ref) => (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        control,
        // The chevron is the nl-select class in styles.css (an arbitrary bg-[url()] value is not generated)
        'nl-select min-h-11 appearance-none pr-10',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';

export const Checkbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }>(
  ({ className, label, ...props }, ref) => (
    <label className={cn('flex min-h-11 cursor-pointer items-center gap-3', className)}>
      <input ref={ref} type="checkbox" className="size-6 shrink-0 accent-forest" {...props} />
      <span>{label}</span>
    </label>
  )
);
Checkbox.displayName = 'Checkbox';
