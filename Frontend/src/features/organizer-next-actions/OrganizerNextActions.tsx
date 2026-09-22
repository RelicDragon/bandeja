/**
 * PRD 364 — the "Next steps" block under the game header.
 *
 * Presentational: receives resolved hints and one `onAction` callback. Two rows
 * are always on screen; the rest fold behind "+N more" and expand in place.
 * Zero hints renders nothing — there is deliberately no green "all done" state.
 */
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarClock,
  ChevronDown,
  ListChecks,
  Receipt,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { splitOrganizerHints } from './buildOrganizerNextActions';
import {
  organizerHintActionLabel,
  organizerHintCaption,
  organizerHintSentence,
} from './organizerNextActionsCopy';
import type { OrganizerHint } from './organizerNextActionsTypes';

export interface OrganizerNextActionsProps {
  hints: readonly OrganizerHint[];
  onAction: (hint: OrganizerHint) => void;
  /** The Nudge request is in flight. */
  isNudging?: boolean;
  /** Start with the fold open (deep links, tests). */
  defaultExpanded?: boolean;
}

const HINT_ICON: Record<OrganizerHint['key'], LucideIcon> = {
  seats: UserPlus,
  booking: CalendarClock,
  attendance: Users,
  cost: Receipt,
};

/** A gap that can cost the game reads amber; everything else stays neutral. */
const HINT_TONE: Record<OrganizerHint['key'], string> = {
  seats: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  booking: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  attendance: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  cost: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

const PRIMARY_ACTION_CLASS =
  'inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg bg-primary-600 px-3 text-sm font-medium text-white shadow-xs transition-colors hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 enabled:active:scale-[0.97] dark:focus-visible:ring-offset-gray-900';

const TEXT_ACTION_CLASS =
  'inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg px-3 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 enabled:active:scale-[0.97] dark:text-primary-400 dark:hover:bg-primary-950/40';

function HintRow({
  hint,
  primary,
  disabled,
  onAction,
}: {
  hint: OrganizerHint;
  primary: boolean;
  disabled: boolean;
  onAction: (hint: OrganizerHint) => void;
}) {
  const { t } = useTranslation();
  const sentenceId = useId();
  const Icon = HINT_ICON[hint.key];
  const caption = organizerHintCaption(hint, t);

  return (
    <li
      className="flex min-h-[44px] items-center gap-3 py-2"
      data-testid={`organizer-hint-${hint.key}`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${HINT_TONE[hint.key]}`}
        aria-hidden
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          id={sentenceId}
          className="text-sm font-medium leading-snug text-gray-900 dark:text-white"
        >
          {organizerHintSentence(hint, t)}
        </p>
        {caption ? (
          <p className="mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
            {caption}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onAction(hint)}
        disabled={disabled}
        aria-describedby={sentenceId}
        aria-busy={hint.key === 'attendance' && disabled && hint.nudgeAllowed ? true : undefined}
        className={`${primary ? PRIMARY_ACTION_CLASS : TEXT_ACTION_CLASS} ${pressScaleGuard}`}
      >
        {organizerHintActionLabel(hint, t)}
      </button>
    </li>
  );
}

export function OrganizerNextActions({
  hints,
  onAction,
  isNudging = false,
  defaultExpanded = false,
}: OrganizerNextActionsProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const headingId = useId();
  const foldId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (hints.length === 0) return null;

  const { visible, hidden } = splitOrganizerHints(hints, false);
  const hasFold = hidden.length > 0;
  const showHidden = hasFold && expanded;

  const isDisabled = (hint: OrganizerHint) =>
    hint.key === 'attendance' && (!hint.nudgeAllowed || isNudging);

  const foldTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: 'easeOut' as const };

  return (
    <Card
      role="region"
      aria-labelledby={headingId}
      data-testid="organizer-next-actions"
      className="p-3 sm:p-4"
    >
      <div className="flex items-center gap-2">
        <ListChecks
          size={18}
          className="shrink-0 text-primary-600 dark:text-primary-400"
          aria-hidden
        />
        <h2 id={headingId} className="section-title min-w-0 flex-1 truncate">
          {t('organizerNextActions.title')}
        </h2>
        {hasFold ? (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={showHidden}
            aria-controls={foldId}
            className={`inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950/40 enabled:active:scale-[0.97] ${pressScaleGuard}`}
          >
            {showHidden
              ? t('organizerNextActions.less')
              : t('organizerNextActions.more', { count: hidden.length })}
            <ChevronDown
              size={14}
              aria-hidden
              className={`transition-transform ${reduceMotion ? '' : 'duration-200'} ${
                showHidden ? 'rotate-180' : ''
              }`}
            />
          </button>
        ) : null}
      </div>

      <ul className="mt-1 divide-y divide-gray-100 dark:divide-gray-800">
        {visible.map((hint, index) => (
          <HintRow
            key={hint.key}
            hint={hint}
            primary={index === 0}
            disabled={isDisabled(hint)}
            onAction={onAction}
          />
        ))}
      </ul>

      {hasFold ? (
        <AnimatePresence initial={false}>
          {showHidden ? (
            <motion.div
              key="fold"
              id={foldId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={foldTransition}
              className="overflow-hidden"
            >
              <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                {hidden.map((hint) => (
                  <HintRow
                    key={hint.key}
                    hint={hint}
                    primary={false}
                    disabled={isDisabled(hint)}
                    onAction={onAction}
                  />
                ))}
              </ul>
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : null}
    </Card>
  );
}
