import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { Club, Court } from '@/types';
import type { Sport } from '@shared/sport';
import type { BookingSnapshotInput } from '@shared/gameBooking/contracts';
import { buildBookingSnapshots } from '@shared/gameBooking/buildBookingSnapshots';
import type { BookingProviderError } from '@shared/booking';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import type { SummaryChipItem } from './summaryHeader/CreateGameSummaryBar';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import { buildPadelooEndTime } from '@/integrations/padeloo/bookFlow';
import { createHydratedClubBookingProvider } from '@/integrations/booking/createClubBookingProvider';
import type { BookSlotContext } from '@/integrations/booking/ClubBookingProvider';
import { bookingErrorMessage } from '@/utils/bookingErrorMessage.util';
import { formatClubDateKey } from '@/integrations/padeloo/slots';
import toast from 'react-hot-toast';

type CourtBookingEntry = {
  court: Court;
  date: Date;
  startTime: string;
  durationMinutes: number;
};

type PadelooCreateGameConfirmModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  club: Club;
  padelooClubId: number;
  bookings: CourtBookingEntry[];
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
  sport?: Sport | null;
  summaryChips: SummaryChipItem[];
  bookFlowContext: BookSlotContext;
  snapshotBlocked: boolean;
  onExecuteCreateGame: (overrides: {
    externalBookingIds: string[];
    bookingSnapshots: BookingSnapshotInput[];
    hasBookedCourt: true;
  }) => Promise<void>;
  onSlotTaken: () => void;
  onSuccess: () => void;
  flowMode?: 'create' | 'edit';
};

function isProviderBookingError(err: unknown): err is BookingProviderError {
  return (
    !!err &&
    typeof err === 'object' &&
    'code' in err &&
    'message' in err &&
    typeof (err as BookingProviderError).code === 'string'
  );
}

export function PadelooCreateGameConfirmModal({
  open,
  onOpenChange,
  club,
  padelooClubId: _padelooClubId,
  bookings,
  email,
  firstName,
  lastName,
  sport,
  summaryChips,
  bookFlowContext,
  snapshotBlocked,
  onExecuteCreateGame,
  onSlotTaken,
  onSuccess,
  flowMode = 'create',
}: PadelooCreateGameConfirmModalProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const reservedAsIdentity = useMemo(() => {
    const name = [firstName, lastName].filter((part) => part?.trim()).join(' ').trim();
    if (name && email) return `${name} · ${email}`;
    return email ?? name ?? null;
  }, [email, firstName, lastName]);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setErrorDetail(null);
      inFlightRef.current = false;
    }
  }, [open]);

  const runConfirm = useCallback(async () => {
    if (inFlightRef.current || snapshotBlocked) return;
    inFlightRef.current = true;
    setBusy(true);
    setErrorDetail(null);
    const bookedIds: string[] = [];

    try {
      const provider = await createHydratedClubBookingProvider(club, {
        durationMinutes: bookings[0]?.durationMinutes,
      });
      if (!provider) throw new Error(t('club.padeloo.errors.generic'));

      for (const entry of bookings) {
        const dateKey = formatClubDateKey(entry.date, club);
        const result = await provider.bookSlot(
          {
            courtId: entry.court.id,
            externalCourtId: entry.court.externalCourtId!,
            courtName: entry.court.name,
            dateKey,
            startTime: entry.startTime,
            durationMinutes: entry.durationMinutes,
            sport: sport ?? entry.court.sport,
          },
          entry.date,
          bookFlowContext,
        );
        bookedIds.push(result.externalBookingId);
      }

      const snapshotInputs = buildBookingSnapshots(
        bookedIds.map((id, index) => {
          const entry = bookings[index];
          const dateKey = formatClubDateKey(entry.date, club);
          const endTime = buildPadelooEndTime(entry.startTime, entry.durationMinutes);
          return {
            uuid: id,
            bookingStart: `${dateKey}T${entry.startTime}`,
            bookingEnd: `${dateKey}T${endTime}`,
            bookingResourceId: entry.court.externalCourtId ?? undefined,
          };
        }),
        bookings.map((b) => b.court),
        { timeZone: getClubTimezone(club) },
      );

      await onExecuteCreateGame({
        externalBookingIds: bookedIds,
        bookingSnapshots: snapshotInputs,
        hasBookedCourt: true,
      });
      onSuccess();
    } catch (err) {
      const detail = bookingErrorMessage(err, t, 'createGame.booktime.bookFailed');
      setErrorDetail(detail);
      if (isProviderBookingError(err) && err.code === 'SlotTaken') {
        onSlotTaken();
      }
      toast.error(detail);
    } finally {
      setBusy(false);
      inFlightRef.current = false;
    }
  }, [
    bookFlowContext,
    bookings,
    club,
    onExecuteCreateGame,
    onSlotTaken,
    onSuccess,
    snapshotBlocked,
    sport,
    t,
  ]);

  if (bookings.length === 0) return null;

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} modalId={`padeloo-create-confirm-${club.id}`}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {flowMode === 'edit'
              ? t('createGame.booktime.confirmEditTitle')
              : t('createGame.booktime.confirmCreateTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-6 pb-6">
          {reservedAsIdentity ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('club.padeloo.connectedAs', { email: reservedAsIdentity })}
            </p>
          ) : null}
          <ul className="space-y-2">
            {bookings.map((entry) => (
              <li key={entry.court.id} className="text-sm">
                <CourtDisplayName
                  name={entry.court.name}
                  integrationName={entry.court.integrationCourtName}
                />
                {' · '}
                {entry.startTime}–{buildPadelooEndTime(entry.startTime, entry.durationMinutes)}
              </li>
            ))}
          </ul>
          {summaryChips.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {summaryChips.map((chip) => (
                <span key={chip.key} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800">
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}
          {errorDetail ? <p className="text-sm text-red-600 dark:text-red-400">{errorDetail}</p> : null}
          <button
            type="button"
            disabled={busy || snapshotBlocked}
            onClick={() => void runConfirm()}
            className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="mx-auto animate-spin" size={18} /> : t('createGame.booktime.confirmAndCreate')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
