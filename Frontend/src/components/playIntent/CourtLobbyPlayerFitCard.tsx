import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Check,
  Clock3,
  Gauge,
  MapPin,
  MessageCircle,
  Users,
  X,
} from 'lucide-react';
import type {
  FitCheck,
  FitDimension,
  PlayIntentTimeOfDay,
  PoolMember,
} from '@/api/playIntents';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CourtLobbyAvatarImage } from '@/components/playIntent/CourtLobbyAvatarImage';
import './CourtLobbyPlayerFitCard.css';

type AnchorRect = { left: number; top: number; width: number; height: number };

type Props = {
  member: PoolMember;
  /** The frozen pinned avatar element the card springs from. */
  anchorEl: HTMLElement | null;
  /** Card is being dismissed — plays the exit spring, then calls onExited. */
  closing: boolean;
  /** Fired after the exit animation finishes (parent then unmounts the card). */
  onExited: () => void;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  /** Starts (or continues) a 1:1 chat with this player. */
  onStartChat?: (userId: string) => void;
};

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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const CARD_MAX_W_PX = 288;
const GAP_PX = 10;

type CardLayout = {
  left: number;
  top: number;
  width: number;
  placement: 'below' | 'above';
  caretLeft: number;
  /** origin X (0..1) used to spring the card out from the avatar center. */
  originX: number;
};

const HEADER = 92; // avatar block height estimate
const ROW = 46;
const ROWS = 5;
const SUMMARY = 30;
const PADDING = 28;
function estimateCardHeight(): number {
  return HEADER + ROWS * ROW + SUMMARY + PADDING;
}

function layoutCard(
  anchor: AnchorRect,
  safe: ReturnType<typeof getSafeViewportRect>,
  measuredHeight: number | undefined,
): CardLayout {
  const anchorCx = anchor.left + anchor.width / 2;
  const width = Math.min(CARD_MAX_W_PX, safe.width);
  const left = clamp(
    anchorCx - width / 2,
    safe.left,
    safe.left + Math.max(0, safe.width - width),
  );

  const h =
    measuredHeight && measuredHeight > 80 ? measuredHeight : estimateCardHeight();
  const safeBottom = safe.top + safe.height;
  const belowTop = anchor.top + anchor.height + GAP_PX;
  const aboveTop = anchor.top - GAP_PX - h;

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
    const extendAbove = anchor.top - GAP_PX - safe.top;
    if (extendBelow >= extendAbove) {
      placement = 'below';
      top = clamp(belowTop, safe.top, Math.max(safe.top, safeBottom - h));
    } else {
      placement = 'above';
      top = clamp(aboveTop, safe.top, Math.max(safe.top, safeBottom - h));
    }
  }
  top = clamp(top, safe.top, Math.max(safe.top, safeBottom - h));

  const caretPad = 10;
  const caretLeft = clamp(anchorCx - left, caretPad, width - caretPad);
  const originX = clamp((anchorCx - left) / width, 0, 1);

  return { left, top, width, placement, caretLeft, originX };
}

const PERIOD_I18N_KEY: Record<PlayIntentTimeOfDay, string> = {
  MORNING: 'playIntent.morning',
  AFTERNOON: 'playIntent.afternoon',
  EVENING: 'playIntent.evening',
  ANYTIME: 'playIntent.anytime',
  CUSTOM: 'playIntent.customTime',
};

const DIM_ICON: Record<FitDimension, typeof CalendarDays> = {
  dates: CalendarDays,
  clubs: MapPin,
  time: Clock3,
  level: Gauge,
  gender: Users,
};

const DIM_LABEL_KEY: Record<FitDimension, string> = {
  dates: 'playIntent.fitDimDates',
  clubs: 'playIntent.fitDimClubs',
  time: 'playIntent.fitDimTime',
  level: 'playIntent.fitDimLevel',
  gender: 'playIntent.fitDimGender',
};

function timeRowSubtitle(
  t: (key: string, opts?: Record<string, unknown>) => string,
  check: FitCheck,
): string | null {
  if (check.dimension !== 'time') return null;
  if (check.period === 'ANYTIME' || !check.period) {
    return t('playIntent.mismatchTimeAnytime', { defaultValue: 'Flexible timing' });
  }
  if (check.period === 'CUSTOM') {
    return t('playIntent.mismatchTimeCustom', { defaultValue: 'Custom hours' });
  }
  const periodLabel = t(PERIOD_I18N_KEY[check.period], {
    defaultValue: check.period.toLowerCase(),
  });
  return t('playIntent.mismatchTime', {
    period: periodLabel,
    defaultValue: `Plays ${periodLabel}`,
  });
}

function FitRow({ check, index }: { check: FitCheck; index: number }) {
  const { t } = useTranslation();
  const Icon = DIM_ICON[check.dimension];
  const subtitle = timeRowSubtitle(t, check);
  const ok = check.ok;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.34,
        ease: [0.22, 1, 0.36, 1],
        delay: 0.1 + index * 0.05,
      }}
      className={`court-lobby-fit-card__row ${ok ? 'is-ok' : 'is-no'}`}
    >
      <span className={`court-lobby-fit-card__row-icon ${ok ? 'is-ok' : 'is-no'}`}>
        <Icon size={15} strokeWidth={2.1} />
      </span>
      <div className="court-lobby-fit-card__row-text">
        <p className="court-lobby-fit-card__row-label">
          {t(DIM_LABEL_KEY[check.dimension])}
        </p>
        {subtitle && (
          <p className="court-lobby-fit-card__row-sub">{subtitle}</p>
        )}
      </div>
      <span
        className={`court-lobby-fit-card__row-mark ${ok ? 'is-ok' : 'is-no'}`}
        aria-hidden
      >
        {ok ? <Check size={13} strokeWidth={3.2} /> : <X size={13} strokeWidth={3.2} />}
      </span>
    </motion.div>
  );
}

export function CourtLobbyPlayerFitCard({
  member,
  anchorEl,
  closing,
  onExited,
  onClose,
  onOpenProfile,
  onStartChat,
}: Props) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const [layout, setLayout] = useState<CardLayout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const fit = member.fit ?? [];
  const okCount = fit.filter((c) => c.ok).length;
  const all = fit.length;
  const displayName =
    [member.firstName, member.lastName].filter(Boolean).join(' ') ||
    t('common.player', { defaultValue: 'Player' });

  const updatePosition = useCallback(() => {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const anchor: AnchorRect = { left: r.left, top: r.top, width: r.width, height: r.height };
    const safe = getSafeViewportRect();
    const measured = cardRef.current?.offsetHeight;
    setLayout(layoutCard(anchor, safe, measured));
  }, [anchorEl]);

  // While the exit animation is playing, ignore further close triggers.
  const requestClose = useCallback(() => {
    if (!closing) onClose();
  }, [closing, onClose]);

  useLayoutEffect(() => {
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
  }, [updatePosition]);

  // Dismiss on Escape + tap-outside. Taps on the pinned avatar itself are
  // ignored here so the arena's click handler owns the toggle (otherwise the
  // mousedown would close the card and the following click would re-open it).
  useEffect(() => {
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (cardRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      requestClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorEl, requestClose]);

  const handleCardClick = () => requestClose();

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestClose();
    onOpenProfile(member.userId);
  };

  const handleChatClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestClose();
    onStartChat?.(member.userId);
  };

  if (layout == null) return null;

  const originClass = layout.placement === 'below' ? 'origin-top' : 'origin-bottom';
  const motionY = layout.placement === 'below' ? { in: -12, out: -8 } : { in: 12, out: 8 };
  const memberInitials = `${(member.firstName || '').charAt(0)}${(member.lastName || '').charAt(0)}`.toUpperCase() || '?';
  const hasFitData = all > 0;
  const summaryTone = okCount === 0 ? 'none' : okCount === all ? 'all' : 'partial';

  return createPortal(
    <AnimatePresence onExitComplete={onExited}>
      {!closing && (
        <motion.div
          key="court-lobby-fit-card"
          ref={cardRef}
          role="dialog"
          aria-label={displayName}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.86, y: motionY.in }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.88, y: motionY.out }}
          transition={
            reduceMotion
              ? { duration: 0.12 }
              : { type: 'spring', stiffness: 320, damping: 24, mass: 0.9 }
          }
          className={`court-lobby-fit-card pointer-events-auto fixed z-[10060] ${originClass}`}
          style={{
            left: layout.left,
            top: layout.top,
            width: layout.width,
            originX: layout.originX,
            originY: layout.placement === 'below' ? 0 : 1,
          }}
          onClick={handleCardClick}
        >
        <span
          className={`court-lobby-fit-card__caret ${
            layout.placement === 'below' ? 'is-below' : 'is-above'
          }`}
          style={{ left: layout.caretLeft }}
          aria-hidden
        />
        <div className="court-lobby-fit-card__shell">
          <div className="court-lobby-fit-card__header">
            <button
              type="button"
              className="court-lobby-fit-card__avatar"
              aria-label={t('playIntent.tapAvatarToView')}
              onClick={handleAvatarClick}
            >
              <span className="court-lobby-fit-card__avatar-ring" aria-hidden />
              <span className="court-lobby-fit-card__avatar-img">
                <CourtLobbyAvatarImage
                  avatar={member.avatar}
                  initials={memberInitials}
                  initialsClassName="court-lobby-fit-card__avatar-initials"
                />
              </span>
            </button>
            <div className="court-lobby-fit-card__title-block">
              <p className="court-lobby-fit-card__name">{displayName}</p>
              <p className="court-lobby-fit-card__title">
                {t('playIntent.fitTitle')}
              </p>
              {hasFitData ? (
                <p className={`court-lobby-fit-card__summary tone-${summaryTone}`}>
                  {t('playIntent.fitSummary', {
                    count: okCount,
                    total: all,
                    defaultValue: `{{count}} of {{total}} match`,
                  })}
                </p>
              ) : (
                <p className="court-lobby-fit-card__title">
                  {t('playIntent.fitNoRequest')}
                </p>
              )}
            </div>
            {onStartChat && (
              <button
                type="button"
                className="court-lobby-fit-card__chat"
                aria-label={t('playIntent.startChat', {
                  defaultValue: 'Message {{name}}',
                  name: displayName,
                })}
                title={t('playIntent.startChat', {
                  defaultValue: 'Message {{name}}',
                  name: displayName,
                })}
                onClick={handleChatClick}
              >
                <MessageCircle size={16} strokeWidth={2.2} />
              </button>
            )}
          </div>

          {hasFitData ? (
            <div className="court-lobby-fit-card__rows">
              {fit.map((check, index) => (
                <FitRow key={check.dimension} check={check} index={index} />
              ))}
            </div>
          ) : null}
        </div>
      </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  ) as ReactNode;
}
