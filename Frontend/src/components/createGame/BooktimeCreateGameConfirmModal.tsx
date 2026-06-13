import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarCheck, Check, Loader2 } from 'lucide-react';
import type { Club, Court } from '@/types';
import type { Sport } from '@shared/sport';
import type { BookingSnapshotInput } from '@shared/gameBooking/contracts';
import { buildBookingSnapshots } from '@shared/gameBooking/buildBookingSnapshots';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import type { SummaryChipItem } from './summaryHeader/CreateGameSummaryBar';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import {
  BooktimeSlotTakenError,
  buildBookingIsoRange,
  cancelBooktimeBooking,
  confirmBooktimeBooking,
  loadBooktimeCompany,
  type BooktimeBookFlowContext,
} from '@/integrations/booktime/bookFlow';
import { resolveBooktimeServiceUuid } from '@/integrations/booktime/resolveBooktimeServiceUuid';
import { formatBooktimeErrorMessage } from '@/integrations/booktime/formatBooktimeErrorMessage';
import { readBooktimeRollbackFromError } from '@/integrations/booktime/createGameErrors';
import {
  bookingErrorMessage,
  isBookingAuthExpiredMessage,
  localizeBookingErrorText,
} from '@/utils/bookingErrorMessage.util';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import toast from 'react-hot-toast';

type CourtBookingEntry = {
  court: Court;
  date: Date;
  startTime: string;
  durationMinutes: number;
};

type ActivityPhase =
  | 'confirm'
  | `booking_${number}`
  | `booking_${number}_done`
  | 'creating'
  | 'success'
  | 'error';

type BooktimeCreateGameConfirmModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  club: Club;
  companyId: string;
  bookings: CourtBookingEntry[];
  phoneNumber: string | null;
  firstName?: string | null;
  lastName?: string | null;
  allowedHoursToCancel: number;
  currency: string;
  sport?: Sport | null;
  summaryChips: SummaryChipItem[];
  bookFlowContext: BooktimeBookFlowContext;
  snapshotBlocked: boolean;
  onExecuteCreateGame: (overrides: {
    externalBookingIds: string[];
    bookingSnapshots: BookingSnapshotInput[];
    hasBookedCourt: true;
    rollbackBooktimeBooking: true;
  }) => Promise<void>;
  onSlotTaken: () => void;
  onSuccess: () => void;
  /** When `edit`, save-step copy reflects game update instead of create. */
  flowMode?: 'create' | 'edit';
};

function formatSheetDate(date: Date, club: Club): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: getClubTimezone(club),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const endMinutes = h * 60 + m + durationMinutes;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

export function BooktimeCreateGameConfirmModal({
  open,
  onOpenChange,
  club,
  companyId,
  bookings,
  phoneNumber,
  firstName,
  lastName,
  allowedHoursToCancel,
  currency,
  sport,
  summaryChips,
  bookFlowContext,
  snapshotBlocked,
  onExecuteCreateGame,
  onSlotTaken,
  onSuccess,
  flowMode = 'create',
}: BooktimeCreateGameConfirmModalProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<ActivityPhase>('confirm');
  const [errorKey, setErrorKey] = useState<
    'slotTaken' | 'bookFailed' | 'multiBookFailed' | 'createFailed' | 'createFailedRollback' | 'session' | null
  >(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [failedBookingIndex, setFailedBookingIndex] = useState<number | null>(null);
  const [priceLabels, setPriceLabels] = useState<Record<string, string | null>>({});
  const [courtPriceQuotes, setCourtPriceQuotes] = useState<
    Record<string, { amount: number; currency: string } | null>
  >({});
  const [priceLoading, setPriceLoading] = useState(false);
  const inFlightRef = useRef(false);
  const bookedIdsRef = useRef<string[]>([]);

  const reservedAsIdentity = useMemo(() => {
    const name = [firstName, lastName].filter((part) => part?.trim()).join(' ').trim();
    if (name && phoneNumber) return `${name} · ${phoneNumber}`;
    return phoneNumber ?? name ?? null;
  }, [firstName, lastName, phoneNumber]);

  const resetState = useCallback(() => {
    setPhase('confirm');
    setErrorKey(null);
    setErrorDetail(null);
    setFailedBookingIndex(null);
    setPriceLabels({});
    setCourtPriceQuotes({});
    setPriceLoading(false);
    inFlightRef.current = false;
    bookedIdsRef.current = [];
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    if (bookings.length === 0) return;

    let cancelled = false;
    setPriceLoading(true);
    setPriceLabels({});
    setCourtPriceQuotes({});

    void (async () => {
      try {
        await hydrateBooktimeSession(club.id, companyId);
        const client = getBooktimeClient(club.id, companyId);
        const company = await loadBooktimeCompany(client, companyId);
        const next: Record<string, string | null> = {};
        const quotes: Record<string, { amount: number; currency: string } | null> = {};
        for (const entry of bookings) {
          const dateKey = formatClubDateKey(entry.date, club);
          const { bookingStart, bookingEnd } = buildBookingIsoRange(
            dateKey,
            entry.startTime,
            entry.durationMinutes,
          );
          const serviceUuid = resolveBooktimeServiceUuid(
            company,
            entry.court.externalCourtId!,
            club.integrationConfig,
            sport ?? entry.court.sport,
          );
          const quote = await client.getPrice({ bookingStart, bookingEnd, serviceUuid });
          const quoteCurrency = quote.currency ?? company.currency ?? currency;
          if (quote.price != null) {
            next[entry.court.id] = t('club.booktime.priceLabel', {
              price: quote.price.toLocaleString(),
              currency: quoteCurrency,
            });
            quotes[entry.court.id] = { amount: quote.price, currency: quoteCurrency };
          } else {
            next[entry.court.id] = t('club.booktime.priceUnavailable');
            quotes[entry.court.id] = null;
          }
        }
        if (!cancelled) {
          setPriceLabels(next);
          setCourtPriceQuotes(quotes);
        }
      } catch {
        if (!cancelled) {
          const fallback: Record<string, string | null> = {};
          const quoteFallback: Record<string, null> = {};
          for (const entry of bookings) {
            fallback[entry.court.id] = t('club.booktime.priceUnavailable');
            quoteFallback[entry.court.id] = null;
          }
          setPriceLabels(fallback);
          setCourtPriceQuotes(quoteFallback);
        }
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookings, club, companyId, currency, open, resetState, sport, t]);

  const reviewPriceTotal = useMemo(() => {
    if (bookings.length < 2 || priceLoading) return null;
    const quotes = bookings.map((entry) => courtPriceQuotes[entry.court.id]);
    if (quotes.some((q) => q == null)) return null;
    const currencies = new Set(quotes.map((q) => q!.currency));
    if (currencies.size !== 1) return null;
    const total = quotes.reduce((sum, q) => sum + (q?.amount ?? 0), 0);
    return { amount: total, currency: quotes[0]!.currency };
  }, [bookings, courtPriceQuotes, priceLoading]);

  const rollbackBookedIds = async () => {
    if (bookedIdsRef.current.length === 0) return;
    try {
      await hydrateBooktimeSession(club.id, companyId);
      const client = getBooktimeClient(club.id, companyId);
      for (const id of bookedIdsRef.current) {
        try {
          await cancelBooktimeBooking(client, id, bookFlowContext.refreshSnapshot);
        } catch {
          /* best effort */
        }
      }
    } catch {
      /* best effort */
    }
    bookedIdsRef.current = [];
  };

  const runActivity = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setErrorKey(null);
    setErrorDetail(null);
    setFailedBookingIndex(null);

    try {
      for (let i = 0; i < bookings.length; i++) {
        const entry = bookings[i];
        setPhase(`booking_${i}`);
        await hydrateBooktimeSession(club.id, companyId);
        const client = getBooktimeClient(club.id, companyId);
        const dateKey = formatClubDateKey(entry.date, club);
        const pending = {
          clubId: club.id,
          courtId: entry.court.id,
          externalCourtId: entry.court.externalCourtId!,
          courtName: entry.court.name,
          dateKey,
          startTime: entry.startTime,
          durationMinutes: entry.durationMinutes,
          sport: sport ?? entry.court.sport,
        };
        try {
          const result = await confirmBooktimeBooking(
            client,
            club,
            companyId,
            pending,
            entry.date,
            bookFlowContext,
          );
          bookedIdsRef.current.push(result.bookingId);
          setPhase(`booking_${i}_done`);
          await new Promise((r) => window.setTimeout(r, 400));
        } catch (bookErr) {
          setFailedBookingIndex(i);
          await rollbackBookedIds();
          const detail = bookingErrorMessage(bookErr, t, 'createGame.booktime.bookFailed');
          setErrorDetail(detail || null);
          if (bookErr instanceof BooktimeSlotTakenError) {
            setErrorKey('slotTaken');
          } else if (isBookingAuthExpiredMessage(formatBooktimeErrorMessage(bookErr))) {
            setErrorKey('session');
          } else if (bookings.length > 1) {
            setErrorKey('multiBookFailed');
          } else {
            setErrorKey('bookFailed');
          }
          toast.error(detail);
          setPhase('error');
          return;
        }
      }

      const snapshotInputs = buildBookingSnapshots(
        bookedIdsRef.current.map((id, index) => {
          const entry = bookings[index];
          const dateKey = formatClubDateKey(entry.date, club);
          const range = buildBookingIsoRange(dateKey, entry.startTime, entry.durationMinutes);
          return {
            uuid: id,
            bookingStart: range.bookingStart,
            bookingEnd: range.bookingEnd,
            bookingResourceId: entry.court.externalCourtId ?? undefined,
          };
        }),
        bookings.map((b) => b.court),
      );

      setPhase('creating');
      await onExecuteCreateGame({
        externalBookingIds: bookedIdsRef.current,
        bookingSnapshots: snapshotInputs,
        hasBookedCourt: true,
        rollbackBooktimeBooking: true,
      });

      setPhase('success');
      await new Promise((r) => window.setTimeout(r, 800));
      onSuccess();
    } catch (err) {
      const detail = bookingErrorMessage(err, t, 'createGame.booktime.createFailedAfterBook');
      const serverRollback = readBooktimeRollbackFromError(err);
      const rollbackDetail = localizeBookingErrorText(serverRollback?.error, t);
      const combinedDetail = [detail, rollbackDetail].filter(Boolean).join(' — ');
      setErrorDetail(combinedDetail || null);

      if (isBookingAuthExpiredMessage(formatBooktimeErrorMessage(err)) || isBookingAuthExpiredMessage(rollbackDetail ?? '')) {
        setErrorKey('session');
        setPhase('error');
        toast.error(combinedDetail);
        return;
      }
      if (!serverRollback?.cancelled && bookedIdsRef.current.length > 0) {
        await rollbackBookedIds();
      }
      bookedIdsRef.current = [];
      setErrorKey(
        serverRollback?.attempted && !serverRollback.cancelled ? 'createFailedRollback' : 'createFailed',
      );
      toast.error(combinedDetail || t('createGame.booktime.createFailedAfterBook'));
      setPhase('error');
    } finally {
      inFlightRef.current = false;
    }
  };

  const dismissLocked =
    phase.startsWith('booking_') || phase === 'creating';

  const handleConfirm = () => {
    if (snapshotBlocked && bookings.length > 0) return;
    void runActivity();
  };

  const handleClose = () => {
    if (dismissLocked) return;
    onOpenChange(false);
  };

  const activitySteps = useMemo(() => {
    const steps: Array<{ key: string; label: string; done: boolean; active: boolean; failed?: boolean }> = [];
    for (let i = 0; i < bookings.length; i++) {
      const entry = bookings[i];
      const bookingPhase = phase === `booking_${i}`;
      const bookingDone =
        phase === `booking_${i}_done` ||
        (phase.startsWith('booking_') && Number(phase.split('_')[1]) > i) ||
        phase === 'creating' ||
        phase === 'success';
      steps.push({
        key: `book-${i}`,
        label: t('createGame.booktime.activityStepBookCourt', {
          court: entry.court.name,
          current: i + 1,
          total: bookings.length,
        }),
        done: bookingDone,
        active: bookingPhase,
        failed: failedBookingIndex === i,
      });
    }
    steps.push({
      key: 'create',
      label:
        flowMode === 'edit'
          ? t('gameDetails.booktimeEdit.activityStep2')
          : t('createGame.booktime.activityStep2'),
      done: phase === 'success',
      active: phase === 'creating',
    });
    return steps;
  }, [bookings, flowMode, phase, failedBookingIndex, t]);

  const fallbackErrorMessage = useMemo(() => {
    switch (errorKey) {
      case 'slotTaken':
        return t('createGame.booktime.slotTaken');
      case 'session':
        return t('createGame.booktime.sessionExpired');
      case 'multiBookFailed':
        return t('createGame.booktime.multiBookFailed', {
          court: failedBookingIndex != null ? bookings[failedBookingIndex]?.court.name : '',
        });
      case 'createFailed':
        return t('createGame.booktime.createFailedAfterBook');
      case 'createFailedRollback':
        return t('createGame.booktime.createFailedRollback');
      case 'bookFailed':
        return t('createGame.booktime.bookFailed');
      default:
        return t('createGame.booktime.bookFailed');
    }
  }, [errorKey, failedBookingIndex, bookings, t]);

  const displayedErrorMessage = errorDetail ?? fallbackErrorMessage;

  return (
    <Dialog open={open} onClose={handleClose} onOpenChange={onOpenChange} modalId="booktime-create-game-confirm">
      <DialogContent
        className="max-w-md max-h-[min(90vh,720px)] overflow-hidden flex flex-col"
        closeOnInteractOutside={!dismissLocked}
        showCloseButton={!dismissLocked}
      >
        <DialogHeader>
          <DialogTitle>
            {phase === 'success'
              ? t('createGame.booktime.successTitle')
              : phase === 'error'
                ? t('createGame.booktime.errorTitle')
                : phase === 'confirm'
                  ? t('createGame.booktime.confirmTitle')
                  : flowMode === 'edit'
                    ? t('gameDetails.booktimeEdit.activityTitle')
                    : t('createGame.booktime.activityTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 overflow-y-auto flex-1 min-h-0" aria-live="polite">
          <AnimatePresence mode="wait">
            {phase === 'confirm' ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {bookings.map((entry) => {
                  const endTime = formatEndTime(entry.startTime, entry.durationMinutes);
                  return (
                    <div
                      key={entry.court.id}
                      className="rounded-xl border-l-4 border-l-primary-500 border border-gray-200 dark:border-gray-700 bg-primary-50/40 dark:bg-primary-950/20 p-4 space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <CalendarCheck size={18} className="text-primary-600 dark:text-primary-400 mt-0.5 shrink-0" />
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatSheetDate(entry.date, club)} · {entry.startTime}–{endTime}
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <CourtDisplayName
                              name={entry.court.name}
                              integrationName={entry.court.integrationCourtName}
                              primaryClassName="font-medium"
                              secondaryClassName="text-xs text-gray-500 dark:text-gray-400"
                            />
                            {' · '}
                            {club.name}
                          </p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {priceLoading ? (
                              <span className="inline-flex items-center gap-2 text-gray-500 font-normal">
                                <Loader2 size={14} className="animate-spin" />
                                {t('club.booktime.loadingPrice')}
                              </span>
                            ) : (
                              priceLabels[entry.court.id] ?? t('club.booktime.priceUnavailable')
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {reviewPriceTotal ? (
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-4 py-3">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('createGame.booktime.reviewTotal')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('club.booktime.priceLabel', {
                        price: reviewPriceTotal.amount.toLocaleString(),
                        currency: reviewPriceTotal.currency,
                      })}
                    </span>
                  </div>
                ) : null}

                {reservedAsIdentity ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('createGame.booktime.reservedAs', { identity: reservedAsIdentity })}
                  </p>
                ) : null}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('createGame.booktime.cancelPolicy', { hours: allowedHoursToCancel })}
                </p>

                {summaryChips.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {summaryChips.map((chip) => (
                      <span
                        key={chip.key}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200"
                      >
                        <span className="shrink-0 text-gray-500 dark:text-gray-400">{chip.icon}</span>
                        {chip.label ? <span className="max-w-[11rem] truncate">{chip.label}</span> : null}
                      </span>
                    ))}
                  </div>
                ) : null}

                {snapshotBlocked && bookings.length > 0 ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {t('createGame.booktime.snapshotBlocked')}
                  </p>
                ) : null}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={snapshotBlocked && bookings.length > 0}
                    onClick={handleConfirm}
                    className="flex-1 rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium disabled:opacity-50"
                  >
                    {t('createGame.booktime.confirmPrimary')}
                  </button>
                </div>
              </motion.div>
            ) : null}

            {(phase.startsWith('booking_') || phase === 'creating') && phase !== 'confirm' ? (
              <motion.div
                key="activity"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 py-4"
              >
                {activitySteps.map((step, index) => (
                  <motion.div
                    key={step.key}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <ActivityStep
                      label={step.label}
                      done={step.done}
                      active={step.active}
                      failed={step.failed}
                    />
                  </motion.div>
                ))}
              </motion.div>
            ) : null}

            {phase === 'success' ? (
              <motion.div
                key="success"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center py-8 text-center space-y-3"
              >
                <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check size={32} className="text-green-600 dark:text-green-400" />
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('createGame.booktime.successTitle')}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('createGame.booktime.successBody')}
                </p>
              </motion.div>
            ) : null}

            {phase === 'error' ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 py-2">
                <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap break-words">
                  {displayedErrorMessage}
                </p>
                <div className="flex gap-2">
                  {errorKey === 'slotTaken' ? (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onSlotTaken();
                      }}
                      className="flex-1 rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium"
                    >
                      {t('createGame.booktime.pickAnotherTime')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        resetState();
                        setPhase('confirm');
                      }}
                      className="flex-1 rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium"
                    >
                      {t('createGame.booktime.tryAgain')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 py-2.5 text-sm font-medium"
                  >
                    {t('common.close')}
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActivityStep({
  label,
  done,
  active,
  failed,
}: {
  label: string;
  done: boolean;
  active: boolean;
  failed?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
          failed
            ? 'bg-red-500 text-white'
            : done
              ? 'bg-green-500 text-white'
              : active
                ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 ring-2 ring-primary-400/50'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
        }`}
      >
        {done ? (
          <Check size={16} />
        ) : active ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <span className="text-xs font-semibold">○</span>
        )}
      </div>
      <span className={`text-sm ${active || done || failed ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-500'}`}>
        {label}
      </span>
    </div>
  );
}
