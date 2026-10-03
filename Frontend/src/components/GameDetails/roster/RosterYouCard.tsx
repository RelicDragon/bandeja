import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCircle2, ChevronDown, Pencil, Wallet } from 'lucide-react';
import { PremiumName } from '@/components/PremiumName';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { CostStateChip } from '@/components/GameDetails/cost/CostStateChip';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { AttendanceAnswer } from '@/api/attendance';
import type { CostShare } from '@/api/gameCost';
import type { RosterRowModel } from './rosterModel';
import { RosterAvatar } from './RosterAvatar';
import { MoneyPill } from './RosterMoney';
import { RosterRowMenu } from './RosterRowMenu';
import { MENU_SLOT, ROW_LAYOUT, ROW_TRAILING, STATUS_TONE, YOU_SURFACE } from './rosterTones';

/**
 * The viewer's own row — pinned first, and the only place they act.
 *
 * It expands in place while something is asked of them (an unanswered
 * "Are you coming?", an unpaid share) and folds back to one line once both
 * are done; "Change" reopens it. The organizer is never asked: organizing is
 * the answer, and the backend reads their PLAYING row as CONFIRMED.
 */

export interface RosterYouCardProps {
  row: RosterRowModel;
  crownRole?: 'OWNER' | 'ADMIN' | 'PLAYER';
  isOrganizer: boolean;
  /** `answersOpen && canAnswer`. */
  askOpen: boolean;
  isAnswering: boolean;
  isOffline: boolean;
  onAnswer: (state: AttendanceAnswer) => Promise<boolean>;
  onRequestLeave?: () => void;
  /** Live roster only: the avatar's remove control. */
  onRemove?: () => void;
  share: CostShare | null;
  money: (minor: number) => string;
  payerName: string | null;
  settledLine: string | null;
  primaryAction: 'SETTLE' | 'SETTLED' | 'NONE';
  settlePending: boolean;
  onOpenSettle: () => void;
  /** Organizer, before FINAL: edit their own share like any other row. */
  onEditShare?: () => void;
  /** Another row has a ⋮ — keep its slot so the pills line up. */
  reserveMenu: boolean;
  flashing: boolean;
  onLegend?: () => void;
}

function AnswerButton({
  kind,
  selected,
  pending,
  disabled,
  onClick,
}: {
  kind: AttendanceAnswer;
  selected: boolean;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const selectedTone =
    kind === 'CONFIRMED'
      ? 'bg-green-600 text-white shadow-sm shadow-green-700/25 dark:bg-green-500'
      : 'bg-amber-400 text-amber-950 shadow-sm shadow-amber-600/20';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      disabled={disabled}
      aria-busy={pending || undefined}
      className={`relative flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-sm font-semibold transition-colors enabled:active:scale-[0.98] ${pressScaleGuard} ${
        pending
          ? // Pending / offline: outlined and dashed, never a blocking spinner.
            'border-2 border-dashed border-primary-400 text-primary-600 dark:text-primary-300'
          : selected
            ? selectedTone
            : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'
      }`}
    >
      {kind === 'CONFIRMED' ? (
        <Check size={15} strokeWidth={2.75} aria-hidden />
      ) : (
        <span aria-hidden className="text-[13px] font-bold leading-none">
          ?
        </span>
      )}
      {pending ? t('attendance.saving') : kind === 'CONFIRMED' ? t('attendance.confirm') : t('attendance.unsure')}
    </button>
  );
}

export function RosterYouCard({
  row,
  crownRole,
  isOrganizer,
  askOpen,
  isAnswering,
  isOffline,
  onAnswer,
  onRequestLeave,
  onRemove,
  share,
  money,
  payerName,
  settledLine,
  primaryAction,
  settlePending,
  onOpenSettle,
  onEditShare,
  reserveMenu,
  flashing,
  onLegend,
}: RosterYouCardProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const [userExpanded, setUserExpanded] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState<AttendanceAnswer | null>(null);

  const attendance = row.attendance;
  const answered = attendance === 'CONFIRMED' || attendance === 'UNSURE';
  const needsAnswer = askOpen && !answered;
  const needsPay = primaryAction === 'SETTLE' && share?.state === 'UNPAID';
  const canExpand = askOpen || primaryAction === 'SETTLE';
  const expanded = needsAnswer || needsPay || (userExpanded && canExpand);

  // Fold back once the last open question is answered.
  const wasNeeded = useRef(needsAnswer || needsPay);
  useEffect(() => {
    const needed = needsAnswer || needsPay;
    if (wasNeeded.current && !needed) setUserExpanded(false);
    wasNeeded.current = needed;
  }, [needsAnswer, needsPay]);

  const name = `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim();
  const statusText = isOrganizer
    ? attendance === 'CONFIRMED'
      ? t('attendance.dots.confirmed')
      : attendance === 'NO_SHOW'
        ? t('attendance.noShow.tag')
        : null
    : attendance === 'CONFIRMED'
      ? t('attendance.confirmedState')
      : attendance === 'UNSURE'
        ? t('attendance.unsureState')
        : attendance === 'NO_SHOW'
          ? t('attendance.noShow.tag')
          : askOpen
            ? t('attendance.dots.unanswered')
            : null;

  const answer = async (state: AttendanceAnswer) => {
    setPendingAnswer(state);
    const saved = await onAnswer(state);
    setPendingAnswer(null);
    // Picking an answer after "Change" is the end of the change.
    if (saved) setUserExpanded(false);
  };

  const transition = reduceMotion ? { duration: 0 } : { duration: 0.26, ease: [0.21, 0.47, 0.32, 0.98] as const };

  return (
    <motion.section
      layout={!reduceMotion}
      aria-label={t('attendance.roster.you')}
      data-roster-row={row.userId}
      className={`${YOU_SURFACE} transition-colors duration-300 ${flashing ? '!from-green-50 dark:!from-green-500/10' : ''}`}
    >
      <div className={ROW_LAYOUT}>
        <RosterAvatar
          user={row.user}
          attendance={attendance}
          isCurrentUser
          role={crownRole}
          onRemove={onRemove}
          onLegend={onLegend}
        />
        <div className="min-w-0 flex-1">
          {/* The tinted, pinned card is the "you" signal; the section's
              accessible name says it for screen readers. */}
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            <PremiumName user={row.user}>{name}</PremiumName>
          </p>
          {statusText ? (
            <p
              className={`mt-0.5 truncate text-xs ${
                attendance ? STATUS_TONE[attendance] : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {statusText}
            </p>
          ) : row.user.verbalStatus ? (
            <p className="verbal-status">{row.user.verbalStatus}</p>
          ) : null}
        </div>

        {(!expanded && share) || (share && onEditShare) || reserveMenu ? (
          <div className={ROW_TRAILING}>
            {!expanded && share ? <MoneyPill amount={money(share.amountMinor)} state={share.state} /> : null}
            {share && onEditShare ? (
              <RosterRowMenu
                name={name}
                items={[
                  {
                    key: 'edit',
                    label: t('cost.editShareFor', { name }),
                    icon: <Pencil size={16} />,
                    onSelect: onEditShare,
                  },
                ]}
              />
            ) : reserveMenu ? (
              <span aria-hidden className={MENU_SLOT} />
            ) : null}
          </div>
        ) : null}
        {canExpand && !needsAnswer && !needsPay ? (
          <button
            type="button"
            onClick={() => setUserExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={t('attendance.change')}
            title={t('attendance.change')}
            className="inline-flex h-11 w-8 shrink-0 items-center justify-center rounded-lg text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950/40"
          >
            <ChevronDown
              size={18}
              aria-hidden
              className={`transition-transform duration-200 motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="you-expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-2.5">
              {askOpen ? (
                <div className="pt-3">
                  <p id={`ask-${row.userId}`} className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {t('attendance.question')}
                  </p>
                  <div
                    role="radiogroup"
                    aria-labelledby={`ask-${row.userId}`}
                    className="flex gap-1 rounded-xl border border-gray-200/90 bg-white p-1 shadow-sm shadow-gray-900/[0.03] dark:border-gray-700 dark:bg-gray-900/80"
                  >
                    {(['CONFIRMED', 'UNSURE'] as const).map((kind) => (
                      <AnswerButton
                        key={kind}
                        kind={kind}
                        selected={attendance === kind}
                        pending={isAnswering && pendingAnswer === kind}
                        disabled={isAnswering}
                        onClick={() => void answer(kind)}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                      {t('attendance.caption')}
                      {isOffline ? <span className="mt-0.5 block">{t('attendance.queuedOffline')}</span> : null}
                    </p>
                    {onRequestLeave ? (
                      <button
                        type="button"
                        onClick={onRequestLeave}
                        className="-mt-3 inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-[11px] font-medium text-gray-500 underline decoration-gray-300 underline-offset-2 dark:text-gray-400 dark:decoration-gray-600"
                      >
                        {t('attendance.cantMakeIt')}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {share ? (
                <div
                  className={`flex items-center gap-3 ${
                    askOpen ? 'mt-1 border-t border-primary-100 pt-3 dark:border-primary-900/50' : 'pt-3'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {t('cost.roster.yourShare')}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold leading-none tabular-nums text-gray-900 dark:text-white">
                        {money(share.amountMinor)}
                      </span>
                      <CostStateChip state={share.state} />
                    </div>
                    <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400">
                      {!row.isPayer && payerName ? t('cost.wallet.toName', { name: payerName }) : null}
                      {!row.isPayer && payerName && settledLine ? (
                        <span aria-hidden className="text-gray-300 dark:text-gray-600">
                          {' · '}
                        </span>
                      ) : null}
                      {settledLine ? (
                        <span className="tabular-nums">{settledLine}</span>
                      ) : null}
                    </p>
                  </div>
                  {primaryAction === 'SETTLE' ? (
                    <button
                      type="button"
                      onClick={onOpenSettle}
                      disabled={settlePending}
                      className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white shadow-sm shadow-primary-600/25 transition-colors hover:bg-primary-700 enabled:active:scale-[0.98] disabled:opacity-60 dark:bg-primary-500 ${pressScaleGuard}`}
                    >
                      <Wallet size={15} aria-hidden />
                      {t('cost.iPaid')}
                    </button>
                  ) : primaryAction === 'SETTLED' ? (
                    <span className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-100 px-4 text-sm font-semibold text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
                      <CheckCircle2 size={15} aria-hidden />
                      {t('cost.settledButton')}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}
