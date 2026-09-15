import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { parseGameSport } from '@/utils/gameSport';
import { eventGoingParticipants, eventLookingParticipants } from '@/utils/eventDetails/eventParticipantLists';
import type { Game } from '@/types';

type EventGoingRowProps = {
  game: Game;
};

export function EventGoingRow({ game }: EventGoingRowProps) {
  const { t } = useTranslation();
  const sport = parseGameSport(game.sport);
  const going = eventGoingParticipants(game.participants);
  const looking = eventLookingParticipants(game.participants);

  return (
    <section className="space-y-3 px-4">
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
        {t('eventDetails.goingCount', { going: going.length, looking: looking.length })}
      </p>
      {going.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {going.map((p) => (
            <PlayerAvatar
              key={p.userId}
              player={p.user}
              smallLayout
              showName={false}
              fullHideName
              levelSport={sport}
            />
          ))}
        </div>
      )}
    </section>
  );
}
