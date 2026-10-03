/**
 * PRD 364 — the "Next steps" block under the game header.
 *
 * Presentational: receives resolved hints and one `onAction` callback. Every
 * step is one full-width tap target; there are at most four, so nothing folds.
 * The first step leads (tinted surface, filled action) — the resolver already
 * sorted by priority. Where a step has a ratio (seats filled, players confirmed,
 * court covered) its icon sits inside a progress ring, so the number reads at a
 * glance instead of hiding in the sentence.
 *
 * Zero hints renders nothing — there is deliberately no green "all done" state.
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  CalendarClock,
  ChevronRight,
  Receipt,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  organizerHintActionLabel,
  organizerHintCaption,
  organizerHintProgress,
  organizerHintSentence,
} from './organizerNextActionsCopy';
import type { OrganizerHint } from './organizerNextActionsTypes';

export interface OrganizerNextActionsProps {
  hints: readonly OrganizerHint[];
  onAction: (hint: OrganizerHint) => void;
  /** The Nudge request is in flight. */
  isNudging?: boolean;
}

const HINT_ICON: Record<OrganizerHint['key'], LucideIcon> = {
  seats: UserPlus,
  booking: CalendarClock,
  attendance: Users,
  cost: Receipt,
};

/** Ring stroke + icon colour. A gap that can cost the game reads amber. */
const HINT_TONE: Record<OrganizerHint['key'], { arc: string; icon: string; fill: string }> = {
  seats: {
    arc: 'stroke-sky-500 dark:stroke-sky-400',
    icon: 'text-sky-700 dark:text-sky-300',
    fill: 'fill-sky-50 dark:fill-sky-950/40',
  },
  booking: {
    arc: 'stroke-amber-500 dark:stroke-amber-400',
    icon: 'text-amber-700 dark:text-amber-300',
    fill: 'fill-amber-50 dark:fill-amber-950/40',
  },
  attendance: {
    arc: 'stroke-emerald-500 dark:stroke-emerald-400',
    icon: 'text-emerald-700 dark:text-emerald-300',
    fill: 'fill-emerald-50 dark:fill-emerald-950/40',
  },
  cost: {
    arc: 'stroke-gray-400 dark:stroke-gray-500',
    icon: 'text-gray-600 dark:text-gray-300',
    fill: 'fill-gray-100 dark:fill-gray-800',
  },
};

const RING_SIZE = 40;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function StepMeter({ hint, reduceMotion }: { hint: OrganizerHint; reduceMotion: boolean }) {
  const Icon = HINT_ICON[hint.key];
  const tone = HINT_TONE[hint.key];
  const progress = organizerHintProgress(hint);
  const clamped = progress === null ? 0 : Math.min(1, Math.max(0, progress));
  const offset = RING_CIRCUMFERENCE * (1 - clamped);
  const center = RING_SIZE / 2;

  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden>
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={center}
          cy={center}
          r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          className={`${tone.fill} ${
            progress === null ? 'stroke-transparent' : 'stroke-gray-200 dark:stroke-gray-700'
          }`}
        />
        {progress !== null && clamped > 0 ? (
          <motion.circle
            cx={center}
            cy={center}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            initial={reduceMotion ? false : { strokeDashoffset: RING_CIRCUMFERENCE }}
            animate={{ strokeDashoffset: offset }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' }}
            className={tone.arc}
          />
        ) : null}
      </svg>
      <Icon size={16} className={`relative ${tone.icon}`} />
    </span>
  );
}

function StepRow({
  hint,
  lead,
  disabled,
  reduceMotion,
  onAction,
}: {
  hint: OrganizerHint;
  lead: boolean;
  disabled: boolean;
  reduceMotion: boolean;
  onAction: (hint: OrganizerHint) => void;
}) {
  const { t } = useTranslation();
  const caption = organizerHintCaption(hint, t);
  const actionLabel = organizerHintActionLabel(hint, t);

  const surface = lead
    ? 'bg-primary-50 ring-1 ring-inset ring-primary-100 enabled:hover:bg-primary-100/70 dark:bg-primary-950/30 dark:ring-primary-900/60 dark:enabled:hover:bg-primary-950/50'
    : 'enabled:hover:bg-gray-50 dark:enabled:hover:bg-gray-800/60';

  return (
    <li data-testid={`organizer-hint-${hint.key}`}>
      <button
        type="button"
        onClick={() => onAction(hint)}
        disabled={disabled}
        aria-busy={hint.key === 'attendance' && disabled && hint.nudgeAllowed ? true : undefined}
        className={`group flex min-h-[56px] w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-[background-color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed enabled:active:scale-[0.98] ${surface} ${pressScaleGuard}`}
      >
        <StepMeter hint={hint} reduceMotion={reduceMotion} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-snug text-gray-900 dark:text-white">
            {organizerHintSentence(hint, t)}
          </span>
          {caption ? (
            <span className="mt-0.5 block text-[11px] leading-snug text-gray-500 dark:text-gray-400">
              {caption}
            </span>
          ) : null}
        </span>
        {lead && !disabled ? (
          <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-primary-600 px-3.5 text-sm font-medium text-white shadow-xs transition-colors group-hover:bg-primary-700">
            {actionLabel}
          </span>
        ) : (
          <span
            className={`inline-flex shrink-0 items-center gap-0.5 text-sm font-medium ${
              disabled
                ? 'text-gray-400 dark:text-gray-500'
                : 'text-primary-600 dark:text-primary-400'
            }`}
          >
            {actionLabel}
            <ChevronRight
              size={16}
              aria-hidden
              className={`transition-transform ${
                reduceMotion || disabled ? '' : 'duration-150 group-hover:translate-x-0.5'
              }`}
            />
          </span>
        )}
      </button>
    </li>
  );
}

export function OrganizerNextActions({
  hints,
  onAction,
  isNudging = false,
}: OrganizerNextActionsProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const headingId = useId();

  if (hints.length === 0) return null;

  const isDisabled = (hint: OrganizerHint) =>
    hint.key === 'attendance' && (!hint.nudgeAllowed || isNudging);

  return (
    <Card
      role="region"
      aria-labelledby={headingId}
      data-testid="organizer-next-actions"
      className="p-2 sm:p-3"
    >
      <div className="flex items-center gap-2 px-2.5 pb-1 pt-1">
        <h2 id={headingId} className="section-title min-w-0 flex-1 truncate">
          {t('organizerNextActions.title')}
        </h2>
        <span
          className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gray-100 px-1.5 text-[11px] font-semibold tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300"
          aria-hidden
        >
          {hints.length}
        </span>
      </div>

      <ul className="space-y-1">
        {hints.map((hint, index) => (
          <StepRow
            key={hint.key}
            hint={hint}
            lead={index === 0}
            disabled={isDisabled(hint)}
            reduceMotion={reduceMotion}
            onAction={onAction}
          />
        ))}
      </ul>
    </Card>
  );
}
