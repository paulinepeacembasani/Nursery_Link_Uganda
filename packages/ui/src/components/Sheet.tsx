import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export type SheetSnap = 'peek' | 'half' | 'full';

const HEIGHT: Record<SheetSnap, string> = {
  peek: '9.5rem',
  half: '50dvh',
  full: 'calc(100dvh - 8rem)',
};
const ORDER: SheetSnap[] = ['peek', 'half', 'full'];

/**
 * The phone list panel over the map: a persistent region (not a dialog, so the map and search
 * stay reachable for screen readers), with three heights. Drag the handle, or press it
 * (keyboard, switch access) to step through the heights.
 */
export const BottomSheet = ({ title, children, snap, onSnapChange, expandLabel = 'Show more of the list', collapseLabel = 'Show more of the map', className }: {
  title: string;
  children: ReactNode;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  expandLabel?: string;
  collapseLabel?: string;
  className?: string;
}) => {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (!panel.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startHeight: panel.current.getBoundingClientRect().height, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.startY - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setDragHeight(Math.max(96, Math.min(window.innerHeight - 96, d.startHeight + dy)));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved || dragHeight === null) return;
    // Settle on the nearest height
    const vh = window.innerHeight;
    const targets: [SheetSnap, number][] = [['peek', 152], ['half', vh / 2], ['full', vh - 128]];
    const nearest = targets.reduce((best, t) => (Math.abs(t[1] - dragHeight) < Math.abs(best[1] - dragHeight) ? t : best));
    setDragHeight(null);
    onSnapChange(nearest[0]);
  };
  const onClick = () => {
    // A tap (not a drag) steps up, wrapping back to the peek
    if (dragHeight !== null) return;
    const next = ORDER[(ORDER.indexOf(snap) + 1) % ORDER.length] ?? 'half';
    onSnapChange(next);
  };

  const expanded = snap === 'full';
  return (
    <section
      ref={panel}
      aria-label={title}
      className={cn('fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-lg bg-paper shadow-float', dragHeight === null && 'transition-[height] duration-200 ease-out', className)}
      style={{ height: dragHeight !== null ? `${String(dragHeight)}px` : HEIGHT[snap] }}
    >
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onClick}
        aria-expanded={expanded}
        aria-label={expanded ? collapseLabel : expandLabel}
        className="flex h-11 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <span aria-hidden className="h-1.5 w-12 rounded-full bg-field/60" />
      </button>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">{children}</div>
    </section>
  );
};
