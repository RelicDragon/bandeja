/**
 * "Use a booking I already made": the viewer's own reservations at the game's
 * club on the game's day, minus ones already linked. A slot with a court lists
 * that court's first, then "Other courts" (linked without `gameCourtId`: the
 * server puts it on its court, taking over the empty planned one). Tap one →
 * it is linked (`?timePolicy=explicit`: the game never moves). Bookings on
 * other days are a count with "Change date and time" (`onOtherDays` opens
 * Edit → When and where, which lists every upcoming one).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, ChevronRight, LoaderCircle } from 'lucide-react';
import type { Club, Court, Game } from '@/types';
import type { CourtSlotView } from '@shared/gameBooking/courtReservations';
import type { LinkBookingToGameBody } from '@shared/gameBooking/contracts';
import { buildLinkBookingRequest } from '@shared/gameBooking/linkBookingToGame';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer';
import { OverlayKeyboardBody } from '@/components/ui/OverlayKeyboardBody';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { ClubBookingConnectInline } from '@/components/booktime/ClubBookingConnectInline';
import { clubToBooktimeRow, resolveCourtForBooking } from '@/components/booktime/booktimeBookingUtils';
import { useClubDateReservations } from '@/components/gameLocationTime/useClubDateReservations';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { useClubTime } from '@/features/court-reservations';
import { parseBooktimeIntegrationConfig } from '@shared/clubIntegration';

export type GameCourtLinkSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: Game;
  club: Club;
  courts: readonly Court[];
  slot: CourtSlotView | null;
  busy?: boolean;
  /** `sameCourt` false: a booking on another court than the slot's. */
  onPick: (body: LinkBookingToGameBody, opts: { sameCourt: boolean }) => void;
  /** Bookings on other days: change the game's date and time first. */
  onOtherDays?: () => void;
  nested?: boolean;
};

type Candidate = {
  id: string;
  courtName: string;
  start: string;
  end: string;
  sameCourt: boolean;
  body: LinkBookingToGameBody;
};

export function GameCourtLinkSheet({
  open,
  onOpenChange,
  game,
  club,
  courts,
  slot,
  busy = false,
  onPick,
  onOtherDays,
  nested,
}: GameCourtLinkSheetProps) {
  const { t } = useTranslation();
  const clock = useClubTime(club.city?.timezone ?? game.city?.timezone);
  useBackButtonModal(open, () => onOpenChange(false), `court-link-${game.id}`);
  const selectedDate = useMemo(() => new Date(game.startTime), [game.startTime]);
  // Stable identity: the upcoming-bookings hooks reload whenever this array changes (a fresh
  // `[...courts]` per render re-rendered forever, even while the sheet was closed).
  const matchCourts = useMemo(() => [...courts], [courts]);
  const reservations = useClubDateReservations({ club, selectedDate, enabled: open, matchCourts });
  // The given courts carry the club system's ids; a club from a list may have courts without them.
  const clubRow = useMemo(
    () => clubToBooktimeRow(courts.length > 0 ? { ...club, courts: [...courts] } : club),
    [club, courts],
  );
  const timeZone = club.city?.timezone ?? game.city?.timezone ?? null;

  const candidates = useMemo((): Candidate[] => {
    const linked = new Set((game.linkedBookings ?? []).map((l) => l.externalBookingId));
    const out: Candidate[] = [];
    for (const record of reservations.dateBookings) {
      if (linked.has(record.uuid)) continue;
      const court = resolveCourtForBooking(record, clubRow, t('club.booktime.unknownCourt'));
      if (slot?.courtId && !court.courtId) continue;
      const sameCourt = !slot?.courtId || court.courtId === slot.courtId;
      try {
        const request = buildLinkBookingRequest(game, record, clubRow, {
          courtId: court.courtId,
          timeZone,
          skipGameDatetimePatch: true,
        });
        const { snapshot } = request;
        out.push({
          id: record.uuid,
          courtName: court.courtName,
          start: snapshot.bookingStart ?? record.bookingStart,
          end: snapshot.bookingEnd ?? record.bookingEnd,
          sameCourt,
          body: { externalBookingId: request.externalBookingId, snapshot },
        });
      } catch {
        /* a reservation without usable times cannot be linked */
      }
    }
    return out.sort((a, b) => Number(b.sameCourt) - Number(a.sameCourt) || a.start.localeCompare(b.start));
  }, [reservations.dateBookings, game, clubRow, slot?.courtId, timeZone, t]);

  const otherDays = useMemo(() => {
    const linked = new Set((game.linkedBookings ?? []).map((l) => l.externalBookingId));
    const today = new Set(reservations.dateBookings.map((r) => r.uuid));
    const now = Date.now();
    return reservations.bookings.filter(
      (r) => !linked.has(r.uuid) && !today.has(r.uuid) && !(Date.parse(r.bookingEnd) <= now),
    ).length;
  }, [reservations.bookings, reservations.dateBookings, game.linkedBookings]);
  const firstOther = candidates.findIndex((c) => !c.sameCourt);
  const otherDaysRow =
    onOtherDays && otherDays > 0 ? (
      <button
        type="button"
        onClick={onOtherDays}
        data-testid="court-link-other-days"
        className="mt-3 flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 text-start text-sm font-medium text-primary-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300 dark:hover:bg-gray-800"
      >
        <span className="min-w-0 flex-1">{t('gameDetails.courts.linkOtherDays', { count: otherDays })}</span>
        <ChevronRight size={16} aria-hidden className="shrink-0 rtl:rotate-180" />
      </button>
    ) : null;

  const needsConnect = open && !reservations.authLoading && reservations.auth != null && !reservations.connected;
  const loading = reservations.authLoading || (reservations.connected && !reservations.bookingsLoaded);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} nested={nested}>
      <DrawerContent accessibleTitle={t('gameDetails.courts.linkTitle')} className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div aria-hidden className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
        <DrawerHeader className="px-0 text-start">
          <DrawerTitle>{t('gameDetails.courts.linkTitle')}</DrawerTitle>
          <DrawerDescription>{t('gameDetails.courts.linkHint', { club: club.name })}</DrawerDescription>
        </DrawerHeader>
        <OverlayKeyboardBody className="min-h-0 flex-1 overflow-y-auto pb-2">
          {needsConnect ? (
            <ClubBookingConnectInline
              club={club}
              integrationConfig={parseBooktimeIntegrationConfig(club.integrationConfig) ?? undefined}
              onConnected={() => onOpenChange(true)}
              onSkip={() => onOpenChange(false)}
              skipLabel={t('gameDetails.courts.connectSkip')}
            />
          ) : loading ? (
            <div className="flex justify-center py-8" aria-busy>
              <LoaderCircle size={20} aria-hidden className="animate-spin text-gray-400 motion-reduce:animate-none" />
            </div>
          ) : candidates.length === 0 ? (
            <>
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400" data-testid="court-link-empty">
                {t('gameDetails.courts.linkEmpty', { club: club.name })}
              </p>
              {otherDaysRow}
            </>
          ) : (
            <>
            <ul className="flex flex-col gap-2" data-testid="court-link-list">
              {candidates.map((c, i) => (
                <li key={c.id}>
                  {i === firstOther ? (
                    <p className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {t('gameDetails.courts.linkOtherCourts')}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPick(c.body, { sameCourt: c.sameCourt })}
                    className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-gray-200 px-3 text-start transition-[background-color,transform] duration-150 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60 enabled:active:scale-[0.99] dark:border-gray-700 dark:hover:bg-gray-800 ${pressScaleGuard}`}
                  >
                    <CalendarCheck size={18} aria-hidden className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{c.courtName}</span>
                      <span className="block text-xs tabular-nums text-gray-500 dark:text-gray-400">{clock.range(c.start, c.end)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {otherDaysRow}
            </>
          )}
        </OverlayKeyboardBody>
      </DrawerContent>
    </Drawer>
  );
}
