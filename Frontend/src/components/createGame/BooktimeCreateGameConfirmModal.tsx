import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarCheck, Check, Loader2 } from 'lucide-react';
import type { Club, Court } from '@/types';
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
import { readBooktimeRollbackFromError } from '@/integrations/booktime/createGameErrors';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';
import { formatClubDateKey } from '@/integrations/booktime/slots';

type ActivityPhase = 'confirm' | 'booking' | 'booking-done' | 'creating' | 'success' | 'error';

type BooktimeCreateGameConfirmModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  club: Club;
  court: Court;
  companyId: string;
  selectedDate: Date;
  selectedTime: string;
  durationHours: number;
  phoneNumber: string | null;
  firstName?: string | null;
  lastName?: string | null;
  allowedHoursToCancel: number;
  currency: string;
  summaryChips: SummaryChipItem[];
  bookFlowContext: BooktimeBookFlowContext;
  snapshotBlocked: boolean;
  skipBookStep: boolean;
  existingExternalBookingId?: string | null;
  onExecuteCreateGame: (overrides: {
    externalBookingId: string;
    hasBookedCourt: boolean;
  }) => Promise<void>;
  onSlotTaken: () => void;
  onSuccess: () => void;
};

function formatSheetDate(date: Date, club: Club): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: getClubTimezone(club),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatEndTime(startTime: string, durationHours: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const totalMinutes = Math.round(durationHours * 60);
  const endMinutes = h * 60 + m + totalMinutes;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

export function BooktimeCreateGameConfirmModal({
  open,
  onOpenChange,
  club,
  court,
  companyId,
  selectedDate,
  selectedTime,
  durationHours,
  phoneNumber,
  firstName,
  lastName,
  allowedHoursToCancel,
  currency,
  summaryChips,
  bookFlowContext,
  snapshotBlocked,
  skipBookStep,
  existingExternalBookingId,
  onExecuteCreateGame,
  onSlotTaken,
  onSuccess,
}: BooktimeCreateGameConfirmModalProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<ActivityPhase>('confirm');
  const [errorKey, setErrorKey] = useState<
    'slotTaken' | 'bookFailed' | 'createFailed' | 'createFailedRollback' | 'session' | null
  >(null);
  const [priceLabel, setPriceLabel] = useState<string | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const inFlightRef = useRef(false);
  const bookedIdRef = useRef<string | null>(null);

  const durationMinutes = Math.round(durationHours * 60);
  const dateKey = formatClubDateKey(selectedDate, club);
  const endTime = formatEndTime(selectedTime, durationHours);
  const dismissLocked = phase === 'booking' || phase === 'creating' || phase === 'booking-done';
  const reservedAsIdentity = useMemo(() => {
    const name = [firstName, lastName].filter((part) => part?.trim()).join(' ').trim();
    if (name && phoneNumber) return `${name} · ${phoneNumber}`;
    return phoneNumber ?? name ?? null;
  }, [firstName, lastName, phoneNumber]);

  const resetState = useCallback(() => {
    setPhase('confirm');
    setErrorKey(null);
    setPriceLabel(null);
    setPriceLoading(false);
    inFlightRef.current = false;
    bookedIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    if (skipBookStep) return;

    let cancelled = false;
    setPriceLoading(true);
    setPriceLabel(null);

    void (async () => {
      try {
        await hydrateBooktimeSession(club.id, companyId);
        const client = getBooktimeClient(club.id, companyId);
        const company = await loadBooktimeCompany(client, companyId);
        const { bookingStart, bookingEnd } = buildBookingIsoRange(dateKey, selectedTime, durationMinutes);
        const resource = company.bookingResources?.find(
          (r) => (r.bookingResourceId ?? r.uuid) === court.externalCourtId,
        );
        const serviceUuid = resource?.serviceUuid;
        if (!serviceUuid) {
          if (!cancelled) setPriceLabel(t('club.booktime.priceUnavailable'));
          return;
        }
        const quote = await client.getPrice({ bookingStart, bookingEnd, serviceUuid });
        if (cancelled) return;
        if (quote.price != null) {
          setPriceLabel(
            t('club.booktime.priceLabel', {
              price: quote.price.toLocaleString(),
              currency: quote.currency ?? company.currency ?? currency,
            }),
          );
        } else {
          setPriceLabel(t('club.booktime.priceUnavailable'));
        }
      } catch {
        if (!cancelled) setPriceLabel(t('club.booktime.priceUnavailable'));
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    club.id,
    companyId,
    court.externalCourtId,
    currency,
    dateKey,
    durationMinutes,
    open,
    selectedTime,
    skipBookStep,
    resetState,
    t,
  ]);

  const runActivity = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setErrorKey(null);

    try {
      let externalBookingId = bookedIdRef.current;

      if (!skipBookStep) {
        setPhase('booking');
        await hydrateBooktimeSession(club.id, companyId);
        const client = getBooktimeClient(club.id, companyId);
        const pending = {
          clubId: club.id,
          courtId: court.id,
          externalCourtId: court.externalCourtId!,
          courtName: court.name,
          dateKey,
          startTime: selectedTime,
          durationMinutes,
        };
        const result = await confirmBooktimeBooking(
          client,
          club,
          companyId,
          pending,
          selectedDate,
          bookFlowContext,
        );
        externalBookingId = result.bookingId;
        bookedIdRef.current = result.bookingId;

        setPhase('booking-done');
        await new Promise((r) => window.setTimeout(r, 500));
      }

      setPhase('creating');
      await onExecuteCreateGame({
        externalBookingId: skipBookStep ? (existingExternalBookingId ?? '') : (externalBookingId ?? ''),
        hasBookedCourt: true,
      });

      setPhase('success');
      await new Promise((r) => window.setTimeout(r, 800));
      onSuccess();
    } catch (err) {
      if (err instanceof BooktimeSlotTakenError) {
        setErrorKey('slotTaken');
        setPhase('error');
        return;
      }
      const message = err instanceof Error ? err.message : '';
      if (/session|expired|401/i.test(message)) {
        setErrorKey('session');
        setPhase('error');
        return;
      }
      if (bookedIdRef.current && !skipBookStep) {
        const serverRollback = readBooktimeRollbackFromError(err);
        if (!serverRollback?.cancelled) {
          try {
            await hydrateBooktimeSession(club.id, companyId);
            const client = getBooktimeClient(club.id, companyId);
            await cancelBooktimeBooking(client, bookedIdRef.current, bookFlowContext.refreshSnapshot);
          } catch {
            /* best effort rollback */
          }
        }
        bookedIdRef.current = null;
        setErrorKey(
          serverRollback?.attempted && !serverRollback.cancelled
            ? 'createFailedRollback'
            : 'createFailed',
        );
      } else if (!skipBookStep && phase === 'booking') {
        setErrorKey('bookFailed');
      } else {
        setErrorKey('createFailed');
      }
      setPhase('error');
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleConfirm = () => {
    if (snapshotBlocked && !skipBookStep) return;
    void runActivity();
  };

  const handleClose = () => {
    if (dismissLocked) return;
    onOpenChange(false);
  };

  const handleSlotTakenRetry = () => {
    onOpenChange(false);
    onSlotTaken();
  };

  const showBookingSection = !skipBookStep;

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
                {showBookingSection ? (
                  <div className="rounded-xl border-l-4 border-l-primary-500 border border-gray-200 dark:border-gray-700 bg-primary-50/40 dark:bg-primary-950/20 p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <CalendarCheck size={18} className="text-primary-600 dark:text-primary-400 mt-0.5 shrink-0" />
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {formatSheetDate(selectedDate, club)} · {selectedTime}–{endTime}
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          <CourtDisplayName
                            name={court.name}
                            integrationName={court.integrationCourtName}
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
                            priceLabel ?? t('club.booktime.priceUnavailable')
                          )}
                        </p>
                        {reservedAsIdentity ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t('createGame.booktime.reservedAs', { identity: reservedAsIdentity })}
                          </p>
                        ) : null}
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('createGame.booktime.cancelPolicy', { hours: allowedHoursToCancel })}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {summaryChips.length > 0 ? (
                  <>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {t('createGame.booktime.yourGame')}
                    </p>
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
                  </>
                ) : null}

                {snapshotBlocked && !skipBookStep ? (
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
                    disabled={snapshotBlocked && !skipBookStep}
                    onClick={handleConfirm}
                    className="flex-1 rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium disabled:opacity-50"
                  >
                    {skipBookStep ? t('createGame.createButton') : t('createGame.booktime.confirmPrimary')}
                  </button>
                </div>
              </motion.div>
            ) : null}

            {(phase === 'booking' || phase === 'booking-done' || phase === 'creating') && !skipBookStep ? (
              <motion.div
                key="activity"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 py-4"
              >
                <ActivityStep
                  label={t('createGame.booktime.activityStep1')}
                  done={phase === 'booking-done' || phase === 'creating'}
                  active={phase === 'booking'}
                />
                <ActivityStep
                  label={t('createGame.booktime.activityStep2')}
                  done={false}
                  active={phase === 'creating'}
                />
              </motion.div>
            ) : null}

            {(phase === 'creating' || phase === 'success') && skipBookStep ? (
              <motion.div
                key="game-only-activity"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6 py-4"
              >
                <ActivityStep label={t('createGame.booktime.activityStep2')} done={phase === 'success'} active={phase === 'creating'} />
              </motion.div>
            ) : null}

            {phase === 'success' ? (
              <motion.div
                key="success"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 24 }}
                className="flex flex-col items-center py-8 text-center space-y-3"
              >
                <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check size={32} className="text-green-600 dark:text-green-400" />
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('createGame.booktime.successTitle')}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {skipBookStep
                    ? t('createGame.booktime.successGameOnly')
                    : t('createGame.booktime.successBody')}
                </p>
              </motion.div>
            ) : null}

            {phase === 'error' ? (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4 py-2"
              >
                <p className="text-sm text-red-600 dark:text-red-400">
                  {errorKey === 'slotTaken'
                    ? t('createGame.booktime.slotTaken')
                    : errorKey === 'session'
                      ? t('createGame.booktime.sessionExpired')
                      : errorKey === 'createFailed'
                        ? t('createGame.booktime.createFailedAfterBook')
                        : errorKey === 'createFailedRollback'
                          ? t('createGame.booktime.createFailedRollback')
                          : t('createGame.booktime.bookFailed')}
                </p>
                <div className="flex gap-2">
                  {errorKey === 'slotTaken' ? (
                    <button
                      type="button"
                      onClick={handleSlotTakenRetry}
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
}: {
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
          done
            ? 'bg-green-500 text-white'
            : active
              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
        }`}
      >
        {done ? (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 28 }}>
            <Check size={16} />
          </motion.div>
        ) : active ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <span className="text-xs font-semibold">○</span>
        )}
      </div>
      <span className={`text-sm ${active || done ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-500'}`}>
        {label}
      </span>
    </div>
  );
}
