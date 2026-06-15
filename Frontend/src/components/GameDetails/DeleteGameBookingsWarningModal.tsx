import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components';
import { LinkedBookingsList } from '@/components/gameLocationTime/LinkedBookingsList';
import {
  formatBooktimeBookingWhen,
  linkedBookingToRecord,
} from '@/components/booktime/booktimeBookingUtils';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { getClubTimezone } from '@/utils/gameTimeDisplay';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import type { Club, Court, EntityType, Game } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';

type DeleteGameBookingsWarningModalProps = {
  isOpen: boolean;
  game: Game;
  courts?: Court[];
  clubs?: Club[];
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function resolveGameClub(game: Game, clubs?: Club[]): Club | undefined {
  return game.court?.club ?? game.club ?? (game.clubId ? clubs?.find((c) => c.id === game.clubId) : undefined);
}

function getDeleteWithBookingsMessageKey(entityType: EntityType): string {
  const keyMap: Record<EntityType, string> = {
    GAME: 'gameDetails.deleteWithBookings.messageGame',
    TOURNAMENT: 'gameDetails.deleteWithBookings.messageTournament',
    LEAGUE: 'gameDetails.deleteWithBookings.messageLeague',
    LEAGUE_SEASON: 'gameDetails.deleteWithBookings.messageLeagueSeason',
    BAR: 'gameDetails.deleteWithBookings.messageBar',
    TRAINING: 'gameDetails.deleteWithBookings.messageTraining',
  };
  return keyMap[entityType] ?? 'gameDetails.deleteWithBookings.messageGame';
}

export function DeleteGameBookingsWarningModal({
  isOpen,
  game,
  courts = [],
  clubs,
  isLoading = false,
  onClose,
  onConfirm,
}: DeleteGameBookingsWarningModalProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const displaySettings = resolveDisplaySettings(user);
  const club = resolveGameClub(game, clubs);
  const clubTimezone = getClubTimezone(game);
  const links = game.linkedBookings ?? [];
  const showLinkedList = Boolean(club && clubHasBookingIntegration(club));

  const fallbackRows = useMemo(() => {
    const bookingLinks = game.linkedBookings ?? [];
    return bookingLinks.map((link) =>
      formatBooktimeBookingWhen(linkedBookingToRecord(link), {
        timezone: clubTimezone,
        displaySettings,
      }),
    );
  }, [clubTimezone, displaySettings, game.linkedBookings]);

  return (
    <Dialog open={isOpen} onClose={() => !isLoading && onClose()} modalId="delete-game-bookings-warning">
      <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('gameDetails.deleteWithBookings.title')}</DialogTitle>
        </DialogHeader>

        <div className="w-12 h-12 rounded-full bg-sky-100 dark:bg-sky-950/40 flex items-center justify-center mx-auto mt-4">
          <CalendarClock size={24} className="text-sky-600 dark:text-sky-400" aria-hidden />
        </div>

        <DialogDescription className="p-4 text-center">
          {t(getDeleteWithBookingsMessageKey(game.entityType))}
        </DialogDescription>

        <div className="px-4 pb-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            {t('gameDetails.deleteWithBookings.bookingsHeading')}
          </p>
          {showLinkedList ? (
            <LinkedBookingsList game={game} club={club} courts={courts} readOnly />
          ) : (
            <ul className="space-y-2">
              {fallbackRows.map((label, index) => (
                <li
                  key={links[index]?.id ?? label}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
                >
                  {label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3 mt-2">
          <Button onClick={onClose} variant="outline" className="flex-1" disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onConfirm} variant="danger" className="flex-1" disabled={isLoading}>
            {isLoading ? t('common.deleting') : t('gameDetails.deleteWithBookings.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
