import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { UserTeam } from '@/types';
import { getTeamParticipantUsers } from '@/utils/teamAvatarPair';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';

function displayName(u: { firstName?: string | null; lastName?: string | null }) {
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || '—';
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Safe rectangle in viewport coordinates for `position: fixed` popovers. */
function getSafeViewportRect() {
  const margin = 12;
  const vv = window.visualViewport;
  if (vv && vv.width > 0 && vv.height > 0) {
    const left = vv.offsetLeft + margin;
    const top = vv.offsetTop + margin;
    const width = Math.max(0, vv.width - 2 * margin);
    const height = Math.max(0, vv.height - 2 * margin);
    return { left, top, width, height };
  }
  return {
    left: margin,
    top: margin,
    width: Math.max(0, window.innerWidth - 2 * margin),
    height: Math.max(0, window.innerHeight - 2 * margin),
  };
}

const POPOVER_MAX_W_PX = 248;
const GAP_PX = 8;

function estimateTipHeight(participantCount: number): number {
  const caret = 6;
  const header = 52;
  const listPad = 16;
  const row = 46;
  const maxList = 216;
  const list = Math.min(maxList, Math.max(1, participantCount) * row + listPad);
  return caret + header + list + 8;
}

type TipPopoverLayout = {
  left: number;
  top: number;
  width: number;
  placement: 'below' | 'above';
  caretLeft: number;
};

function layoutTipPopover(
  trigger: DOMRect,
  safe: ReturnType<typeof getSafeViewportRect>,
  participantCount: number,
  measuredHeight: number | undefined,
): TipPopoverLayout {
  const triggerCx = trigger.left + trigger.width / 2;
  const width = Math.min(POPOVER_MAX_W_PX, safe.width);
  const left = clamp(triggerCx - width / 2, safe.left, safe.left + Math.max(0, safe.width - width));

  const h = measuredHeight && measuredHeight > 48 ? measuredHeight : estimateTipHeight(participantCount);
  const safeBottom = safe.top + safe.height;
  const belowTop = trigger.bottom + GAP_PX;
  const aboveTop = trigger.top - GAP_PX - h;

  const fitsBelow = belowTop + h <= safeBottom + 0.5;
  const fitsAbove = aboveTop >= safe.top - 0.5;

  let placement: 'below' | 'above';
  let top: number;
  if (fitsBelow) {
    placement = 'below';
    top = belowTop;
  } else if (fitsAbove) {
    placement = 'above';
    top = aboveTop;
  } else {
    const extendBelow = safeBottom - belowTop;
    const extendAbove = trigger.top - GAP_PX - safe.top;
    if (extendBelow >= extendAbove) {
      placement = 'below';
      top = clamp(belowTop, safe.top, Math.max(safe.top, safeBottom - h));
    } else {
      placement = 'above';
      top = clamp(aboveTop, safe.top, Math.max(safe.top, safeBottom - h));
    }
  }

  top = clamp(top, safe.top, Math.max(safe.top, safeBottom - h));

  const caretPad = 8;
  const caretLeft = clamp(triggerCx - left, caretPad, width - caretPad);

  return { left, top, width, placement, caretLeft };
}

const TIP_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

const ParticipantTipPopover = forwardRef<
  HTMLDivElement,
  {
    team: UserTeam;
    tipId: string;
    layout: TipPopoverLayout;
    participants: ReturnType<typeof getTeamParticipantUsers>;
    onActivatePlayer: (playerId: string) => void;
  }
>(function ParticipantTipPopover({ team, tipId, layout, participants, onActivatePlayer }, ref) {
  const { left, top, width, placement, caretLeft } = layout;
  const originClass = placement === 'below' ? 'origin-top' : 'origin-bottom';
  const motionY = placement === 'below' ? { in: -10, out: -6 } : { in: 10, out: 6 };
  return (
    <motion.div
      ref={ref}
      id={tipId}
      role="dialog"
      initial={{ opacity: 0, scale: 0.94, y: motionY.in }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: motionY.out }}
      transition={TIP_TRANSITION}
      className={`pointer-events-auto fixed z-[10050] ${originClass}`}
      style={{ left, top, width }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`pointer-events-none absolute z-[1] h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[1px] border border-gray-200/70 bg-white shadow-[0_4px_12px_rgba(15,23,42,0.15)] dark:border-white/[0.12] dark:bg-[rgb(23,23,26)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.45)] ${
          placement === 'below' ? 'top-0 -translate-y-[45%]' : 'bottom-0 translate-y-[45%]'
        }`}
        style={{ left: caretLeft }}
        aria-hidden
      />
      <div className="relative overflow-hidden rounded-2xl border border-gray-200/70 bg-white/95 shadow-[0_22px_56px_-10px_rgba(15,23,42,0.32),0_10px_28px_-6px_rgba(15,23,42,0.2),0_4px_12px_-2px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.06] backdrop-blur-md dark:border-white/[0.1] dark:bg-[rgb(23,23,26)]/95 dark:shadow-[0_28px_64px_-8px_rgba(0,0,0,0.72),0_14px_36px_-10px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(255,255,255,0.05)] dark:ring-white/[0.06]">
        <div className="border-b border-gray-100/90 px-3.5 pb-2.5 pt-3 dark:border-white/[0.06]">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug tracking-tight text-slate-900 dark:text-white">
              {team.name}
            </p>
            <span className="shrink-0 rounded-full bg-slate-100/90 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-500 dark:bg-white/[0.08] dark:text-slate-400">
              {participants.length}
            </span>
          </div>
        </div>
        <ul className="max-h-[13.5rem] space-y-0.5 overflow-y-auto overscroll-contain px-1.5 py-2">
          {participants.map((u) => (
            <li key={u.id} className="list-none">
              <button
                type="button"
                className="flex w-full min-w-0 cursor-pointer items-start gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors duration-150 hover:bg-slate-50/90 dark:hover:bg-white/[0.06]"
                onClick={(e) => {
                  e.stopPropagation();
                  onActivatePlayer(u.id);
                }}
              >
                <span className="mt-0.5 shrink-0 rounded-full shadow-sm ring-2 ring-white/80 dark:ring-gray-900/80">
                  <PlayerAvatar player={u} extrasmall fullHideName showName={false} asDiv subscribePresence={false} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium leading-snug tracking-tight text-slate-700 dark:text-slate-200">
                    {displayName(u)}
                  </p>
                  {u.verbalStatus?.trim() ? <p className="verbal-status mt-0.5">{u.verbalStatus.trim()}</p> : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
});

export function TeamAvatarParticipantTipShell({ team, children }: { team: UserTeam; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<TipPopoverLayout | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const tipId = useId();
  const participants = getTeamParticipantUsers(team);
  const { openPlayerCard } = usePlayerCardModal();

  const close = useCallback(() => setOpen(false), []);

  const handleActivatePlayer = useCallback(
    (playerId: string) => {
      openPlayerCard(playerId);
      setOpen(false);
    },
    [openPlayerCard],
  );

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const safe = getSafeViewportRect();
    const measured = popupRef.current?.offsetHeight;
    setLayout(layoutTipPopover(r, safe, participants.length, measured));
  }, [participants.length]);

  const toggle = useCallback((e: ReactMouseEvent | ReactKeyboardEvent) => {
    e.stopPropagation();
    setOpen((was) => {
      if (was) return false;
      const el = triggerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const safe = getSafeViewportRect();
        setLayout(layoutTipPopover(rect, safe, participants.length, undefined));
      }
      return true;
    });
  }, [participants.length]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      updatePosition();
      raf2 = requestAnimationFrame(updatePosition);
    });
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updatePosition);
    vv?.addEventListener('scroll', updatePosition);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      vv?.removeEventListener('resize', updatePosition);
      vv?.removeEventListener('scroll', updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const portal =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {open && layout != null && (
              <ParticipantTipPopover
                key={`team-roster-${team.id}`}
                ref={popupRef}
                team={team}
                tipId={tipId}
                layout={layout}
                participants={participants}
                onActivatePlayer={handleActivatePlayer}
              />
            )}
          </AnimatePresence>,
          document.body
        )
      : null;

  return (
    <>
      <div ref={triggerRef} className="inline-flex shrink-0">
        <div
          tabIndex={0}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? tipId : undefined}
          aria-label={team.name}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle(e);
            }
          }}
          className="cursor-pointer select-none rounded-2xl outline-none transition-shadow duration-200 focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-slate-500/45 dark:focus-visible:ring-offset-gray-950"
        >
          {children}
        </div>
      </div>
      {portal}
    </>
  );
}
