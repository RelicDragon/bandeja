/**
 * "Reserve now" for one or more court slots of an existing game.
 *
 * Reuses the create/edit provider confirm modals (`ClubCreateGameConfirmModal`:
 * Booktime / Padeloo / Klikteren / Nspadel / Weltner — same review, booking and
 * rollback). Instead of saving a game, each new booking is linked to its slot
 * (`POST /games/:id/link-booking` with `gameCourtId`, `?timePolicy=explicit`:
 * linking never moves the game). Not connected yet → the club's connect step
 * in a sheet first.
 */
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Club, Game } from '@/types';
import type { BookingSnapshotInput } from '@shared/gameBooking/contracts';
import {
  getKlikterenVenueId,
  getPadelooClubId,
  isKlikterenClub,
  isNspadelClub,
  isPadelooClub,
  isWeltnerClub,
  parseBooktimeIntegrationConfig,
} from '@shared/clubIntegration';
import { courtSlotsApi } from '@/api/courtSlots';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer';
import { ClubCreateGameConfirmModal } from '@/components/createGame/ClubCreateGameConfirmModal';
import { ClubBookingConnectInline } from '@/components/booktime/ClubBookingConnectInline';
import { useClubBookingAuth } from '@/hooks/useClubBookingAuth';
import { useBooktimeCompanyMeta } from '@/hooks/useBooktimeCompanyMeta';
import { useClubSnapshotRefresh } from '@/hooks/useClubSnapshotRefresh';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { useClubTime } from '@/features/court-reservations';
import type { ReserveEntry } from './gameCourtsModel';

export type GameCourtReserveFlowProps = {
  open: boolean;
  onClose: () => void;
  game: Game;
  club: Club;
  entries: readonly ReserveEntry[];
  /** After the bookings were made and linked (refresh the game). */
  onLinked: () => void | Promise<void>;
  /** Linked bookings to drop once the new ones are linked (e.g. "Reserve again" for a missing one). */
  replaceExternalBookingIds?: readonly string[];
};

export function GameCourtReserveFlow({
  open,
  onClose,
  game,
  club,
  entries,
  onLinked,
  replaceExternalBookingIds = [],
}: GameCourtReserveFlowProps) {
  const { t } = useTranslation();
  const clock = useClubTime(club.city?.timezone ?? game.city?.timezone);
  const { status: auth, loading: authLoading, refresh: refreshAuth } = useClubBookingAuth(club, open);
  const connected = Boolean(auth?.connected);
  const firstStart = entries[0]?.start ?? game.startTime;
  const date = useMemo(() => new Date(firstStart), [firstStart]);
  const durationMinutes = entries[0]?.durationMinutes ?? 60;
  const companyMeta = useBooktimeCompanyMeta(club, open && connected);
  const { refreshSnapshot, lastFetchedAt, snapshotBanner } = useClubSnapshotRefresh(club, date, open && connected, {
    durationMinutes,
  });
  const snapshotBlocked = snapshotBanner === 'noSyncToday' || (snapshotBanner === 'scoutPoolEmpty' && !lastFetchedAt);
  const showConnect = open && !authLoading && auth != null && !connected;
  useBackButtonModal(showConnect, onClose, `court-reserve-connect-${game.id}`);

  const bookings = useMemo(
    () =>
      entries.flatMap((entry) => {
        const court = club.courts?.find((c) => c.id === entry.courtId);
        const wall = clock.wallClock(entry.start);
        if (!court || !wall) return [];
        return [{ court, date: new Date(entry.start), startTime: wall.time, durationMinutes: entry.durationMinutes }];
      }),
    [entries, club.courts, clock],
  );

  const linkBookings = async (snapshots: BookingSnapshotInput[], externalBookingIds: string[]) => {
    const remaining = [...entries];
    for (const [index, externalBookingId] of externalBookingIds.entries()) {
      const snapshot = snapshots.find((s) => s.externalBookingId === externalBookingId) ?? snapshots[index];
      if (!snapshot) continue;
      const entryIndex = remaining.findIndex((e) => e.courtId === snapshot.courtId);
      const entry = entryIndex >= 0 ? remaining.splice(entryIndex, 1)[0] : undefined;
      await courtSlotsApi.linkBooking(game.id, {
        externalBookingId,
        snapshot: { ...snapshot, externalBookingId },
        ...(entry?.gameCourtId ? { gameCourtId: entry.gameCourtId } : {}),
      });
    }
    if (replaceExternalBookingIds.length > 0) {
      await courtSlotsApi.unlinkBookings(game.id, [...replaceExternalBookingIds]);
    }
  };

  const common = {
    open: open && connected && bookings.length > 0,
    onOpenChange: (next: boolean) => {
      if (!next) onClose();
    },
    club,
    bookings,
    sport: game.sport,
    summaryChips: [],
    bookFlowContext: { refreshSnapshot, lastFetchedAt },
    snapshotBlocked,
    onExecuteCreateGame: async (overrides: { externalBookingIds: string[]; bookingSnapshots: BookingSnapshotInput[] }) => {
      await linkBookings(overrides.bookingSnapshots, overrides.externalBookingIds);
    },
    onSlotTaken: () => {
      toast.error(t('gameDetails.courts.slotTaken'));
      onClose();
    },
    onSuccess: () => {
      void onLinked();
      onClose();
    },
    flowMode: 'edit' as const,
  };

  const booktimeConfig = parseBooktimeIntegrationConfig(club.integrationConfig);
  let modal: ReactNode = null;
  if (isWeltnerClub(club)) {
    modal = <ClubCreateGameConfirmModal provider="WELTNER" {...common} />;
  } else if (isNspadelClub(club)) {
    modal = <ClubCreateGameConfirmModal provider="NSPADELSUPABASE" {...common} />;
  } else if (isKlikterenClub(club) && getKlikterenVenueId(club) != null) {
    modal = (
      <ClubCreateGameConfirmModal
        provider="KLIKTEREN"
        klikterenVenueId={getKlikterenVenueId(club)!}
        email={auth?.email ?? null}
        firstName={auth?.firstName ?? null}
        lastName={auth?.lastName ?? null}
        {...common}
      />
    );
  } else if (isPadelooClub(club) && getPadelooClubId(club) != null) {
    modal = (
      <ClubCreateGameConfirmModal
        provider="PADELOO"
        padelooClubId={getPadelooClubId(club)!}
        email={auth?.email ?? null}
        firstName={auth?.firstName ?? null}
        lastName={auth?.lastName ?? null}
        {...common}
      />
    );
  } else if (booktimeConfig) {
    modal = (
      <ClubCreateGameConfirmModal
        provider="BOOKTIME"
        companyId={booktimeConfig.companyId}
        phoneNumber={auth?.phoneNumber ?? null}
        firstName={auth?.firstName ?? null}
        lastName={auth?.lastName ?? null}
        allowedHoursToCancel={companyMeta.allowedHoursToCancel}
        currency={companyMeta.currency}
        {...common}
      />
    );
  }

  return (
    <>
      <Drawer open={showConnect} onOpenChange={(next) => !next && onClose()}>
        <DrawerContent accessibleTitle={t('gameDetails.courts.connectTitle')} className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div aria-hidden className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
          <DrawerHeader className="px-0 text-start">
            <DrawerTitle>{t('gameDetails.courts.connectTitle')}</DrawerTitle>
          </DrawerHeader>
          <ClubBookingConnectInline
            club={club}
            integrationConfig={booktimeConfig ?? undefined}
            onConnected={() => void refreshAuth()}
            onSkip={onClose}
            skipLabel={t('gameDetails.courts.connectSkip')}
          />
        </DrawerContent>
      </Drawer>
      {modal}
    </>
  );
}
