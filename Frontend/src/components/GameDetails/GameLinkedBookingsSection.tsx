import { useTranslation } from 'react-i18next';
import { CalendarCheck } from 'lucide-react';
import { Card } from '@/components';
import { LinkedBookingsList } from '@/components/gameLocationTime/LinkedBookingsList';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { gamesApi } from '@/api';
import type { Club, Court, Game } from '@/types';

type GameLinkedBookingsSectionProps = {
  game: Game;
  courts: Court[];
  clubs?: Club[];
  onGameUpdate?: (game: Game) => void;
};

function resolveGameClub(game: Game, clubs?: Club[]): Club | undefined {
  return game.court?.club ?? game.club ?? (game.clubId ? clubs?.find((c) => c.id === game.clubId) : undefined);
}

export function GameLinkedBookingsSection({ game, courts, clubs, onGameUpdate }: GameLinkedBookingsSectionProps) {
  const { t } = useTranslation();
  const hasClub = Boolean(game.clubId || game.club || game.court?.club);
  const club = resolveGameClub(game, clubs);

  if (!hasClub || !club || !clubHasBookingIntegration(club)) return null;
  if ((game.linkedBookings?.length ?? 0) === 0) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <CalendarCheck size={20} className="text-primary-600 dark:text-primary-400 shrink-0" />
        <h2 className="section-title">{t('createGame.locationTime.linkedOnlyLabel')}</h2>
      </div>
      <LinkedBookingsList
        game={game}
        club={club}
        courts={courts}
        readOnly
        verifyOwnership
        onBookingUnlinked={async () => {
          if (!onGameUpdate) return;
          const response = await gamesApi.getById(game.id);
          onGameUpdate(response.data);
        }}
      />
    </Card>
  );
}
