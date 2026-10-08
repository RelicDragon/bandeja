import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { create } from 'zustand';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export type ChatListSwipeAction = {
  id: string;
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  className: string;
  disabled?: boolean;
};

/** One open row at a time across the list. */
const useOpenSwipeRow = create<{ openKey: string | null; setOpenKey: (key: string | null) => void }>((set) => ({
  openKey: null,
  setOpenKey: (openKey) => set({ openKey }),
}));

const ACTION_WIDTH = 72;
const LOCK_PX = 8;
const SNAP_SPRING = { type: 'spring', stiffness: 520, damping: 42 } as const;

const coarsePointer =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;

type Props = {
  rowKey: string;
  actions: ChatListSwipeAction[];
  children: ReactNode;
};

/**
 * Swipe toward the start edge to reveal row actions (touch screens only; mouse
 * screens use the hover buttons in `ChatListRowActions`). `touch-action: pan-y`
 * leaves vertical scrolling to the browser, so the list never fights the swipe.
 */
export function ChatListSwipeRow({ rowKey, actions, children }: Props) {
  const reduceMotion = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const total = actions.length * ACTION_WIDTH;
  const isOpen = useOpenSwipeRow((s) => s.openKey === rowKey);
  const setOpenKey = useOpenSwipeRow((s) => s.setOpenKey);
  const gesture = useRef<{ x: number; y: number; base: number; axis: 'x' | 'y' | null; dir: number } | null>(null);
  const swallowClick = useRef(false);

  const revealed = useTransform(x, (v) => Math.abs(v));

  const settle = useCallback(
    (open: boolean, dir: number) => {
      const target = open ? -total * dir : 0;
      if (reduceMotion) x.set(target);
      else animate(x, target, SNAP_SPRING);
    },
    [reduceMotion, total, x]
  );

  const dirSign = () => (rootRef.current && getComputedStyle(rootRef.current).direction === 'rtl' ? -1 : 1);

  useEffect(() => {
    if (!isOpen && x.get() !== 0) settle(false, 1);
  }, [isOpen, settle, x]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideTouch = (e: TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenKey(null);
    };
    document.addEventListener('touchstart', closeOnOutsideTouch, { capture: true, passive: true });
    return () => document.removeEventListener('touchstart', closeOnOutsideTouch, { capture: true });
  }, [isOpen, setOpenKey]);

  useEffect(() => () => {
    if (useOpenSwipeRow.getState().openKey === rowKey) useOpenSwipeRow.getState().setOpenKey(null);
  }, [rowKey]);

  if (!coarsePointer || actions.length === 0) return <>{children}</>;

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch || e.touches.length > 1) return;
    gesture.current = { x: touch.clientX, y: touch.clientY, base: x.get(), axis: null, dir: dirSign() };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    const touch = e.touches[0];
    if (!g || !touch) return;
    const dx = touch.clientX - g.x;
    const dy = touch.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) > LOCK_PX && Math.abs(dx) > Math.abs(dy) * 1.2) g.axis = 'x';
      else if (Math.abs(dy) > LOCK_PX) g.axis = 'y';
      else return;
    }
    if (g.axis !== 'x') return;
    const travel = (g.base + dx) * g.dir;
    const clamped = travel > 0 ? 0 : travel < -total ? -total + (travel + total) * 0.25 : travel;
    x.set(clamped * g.dir);
  };

  const onTouchEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.axis !== 'x') return;
    swallowClick.current = true;
    const open = Math.abs(x.get()) > total / 2;
    settle(open, g.dir);
    if (open) setOpenKey(rowKey);
    else if (useOpenSwipeRow.getState().openKey === rowKey) setOpenKey(null);
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (swallowClick.current || isOpen) {
      e.stopPropagation();
      e.preventDefault();
      swallowClick.current = false;
      if (isOpen) setOpenKey(null);
    }
  };

  return (
    <div ref={rootRef} className="relative overflow-hidden">
      <motion.div
        className="absolute inset-y-0 end-0 flex justify-end overflow-hidden"
        style={{ width: revealed }}
        aria-hidden={!isOpen}
      >
        <div className="flex h-full shrink-0" style={{ width: total }}>
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={a.disabled}
              tabIndex={isOpen ? 0 : -1}
              onClick={() => {
                a.onClick();
                setOpenKey(null);
              }}
              className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-white disabled:opacity-60 ${a.className}`}
              style={{ width: ACTION_WIDTH }}
            >
              <a.Icon className="h-5 w-5" aria-hidden />
              {a.label}
            </button>
          ))}
        </div>
      </motion.div>
      <motion.div
        style={{ x, touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={onClickCapture}
      >
        {children}
      </motion.div>
    </div>
  );
}
