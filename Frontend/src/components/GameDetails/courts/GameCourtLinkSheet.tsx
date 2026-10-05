/**
 * "Link my reservation": the viewer's own reservations at the game's club on
 * the game's day (same data as the reservations strip), minus ones already
 * linked. Assigned slots only list reservations on that court; an "Any court"
 * slot lists all. Tap one → it is linked to the slot (the caller posts it
 * with `gameCourtId`, `?timePolicy=explicit`: the game never moves).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, LoaderCircle } from 'lucide-react';
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
  onPick: (body: LinkBookingToGameBody) => void;
  nested?: boolean;
};

type Candidate = { id: string; courtName: string; start: string; end: string; body: LinkBookingToGameBody };

export function GameCourtLinkSheet({ open, onOpenChange, game, club, courts, slot, busy = false, onPick, nested }: GameCourtLinkSheetProps) {
  const { t } = useTranslation();
  const clock = useClubTime(club.city?.timezone ?? game.city?.timezone);
  useBackButtonModal(open, () => onOpenChange(false), `court-link-${game.id}`);
  const selectedDate = useMemo(() => new Date(game.startTime), [game.startTime]);
  // Stable identity: the upcoming-bookings hooks reload whenever this array changes (a fresh
  // `[...courts]` per render re-rendered forever, even while the sheet was closed).
  const matchCourts = useMemo(() => [...courts], [courts]);
  const reservations = useClubDateReservations({ club, selectedDate, enabled: open, matchCourts });
  const clubRow = useMemo(() => clubToBooktimeRow(club), [club]);
  const timeZone = club.city?.timezone ?? game.city?.timezone ?? null;

  const candidates = useMemo((): Candidate[] => {
    const linked = new Set((game.linkedBookings ?? []).map((l) => l.externalBookingId));
    const out: Candidate[] = [];
    for (const record of reservations.dateBookings) {
      if (linked.has(record.uuid)) continue;
      const court = resolveCourtForBooking(record, clubRow, t('club.booktime.unknownCourt'));
      if (slot?.courtId && court.courtId !== slot.courtId) continue;
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
          body: { externalBookingId: request.externalBookingId, snapshot },
        });
      } catch {
        /* a reservation without usable times cannot be linked */
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }, [reservations.dateBookings, game, clubRow, slot?.courtId, timeZone, t]);

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
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400" data-testid="court-link-empty">
              {t('gameDetails.courts.linkEmpty', { club: club.name })}
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="court-link-list">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPick(c.body)}
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
          )}
        </OverlayKeyboardBody>
      </DrawerContent>
    </Drawer>
  );
}
