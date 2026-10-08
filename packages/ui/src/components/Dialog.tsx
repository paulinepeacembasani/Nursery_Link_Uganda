import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';

const Overlay = () => <RadixDialog.Overlay className="fixed inset-0 z-40 bg-canopy/40 data-[state=open]:animate-fade-in" />;

const CloseButton = ({ label }: { label: string }) => (
  <RadixDialog.Close asChild>
    <Button variant="ghost" size="icon" aria-label={label} className="shrink-0">
      <X aria-hidden />
    </Button>
  </RadixDialog.Close>
);

/** A centred dialog for confirmations ("Confirm delivery") and short forms. */
export const Dialog = ({ open, onOpenChange, title, description, children, footer, closeLabel = 'Close' }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
}) => (
  <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
    <RadixDialog.Portal>
      <Overlay />
      <RadixDialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-1/2 flex-col gap-4 overflow-y-auto rounded-lg bg-paper shadow-card p-5 shadow-float data-[state=open]:animate-fade-in">
        <div className="flex items-start justify-between gap-3">
          <RadixDialog.Title className="text-xl font-bold text-canopy">{title}</RadixDialog.Title>
          <CloseButton label={closeLabel} />
        </div>
        {description ? <RadixDialog.Description className="text-bark">{description}</RadixDialog.Description> : <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>}
        {children}
        {footer && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  </RadixDialog.Root>
);

/**
 * A panel sliding in from the right (desktop nursery card, Library entry). On small screens it
 * fills the screen. `modal={false}` keeps the map behind it usable.
 */
export const Drawer = ({ open, onOpenChange, title, children, footer, modal = true, closeLabel = 'Close', className }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  modal?: boolean;
  closeLabel?: string;
  className?: string;
}) => (
  <RadixDialog.Root open={open} onOpenChange={onOpenChange} modal={modal}>
    <RadixDialog.Portal>
      {modal && <Overlay />}
      <RadixDialog.Content
        onInteractOutside={modal ? undefined : e => { e.preventDefault(); }}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-paper shadow-float data-[state=open]:animate-drawer-in sm:max-w-md sm:rounded-l-lg',
          className
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <RadixDialog.Title asChild>
            <div className="text-xl font-bold text-canopy">{title}</div>
          </RadixDialog.Title>
          <CloseButton label={closeLabel} />
        </div>
        <RadixDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Details'}</RadixDialog.Description>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line bg-paper px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  </RadixDialog.Root>
);
