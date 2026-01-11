import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayersStore } from '@/store/playersStore';
import { useAuthStore } from '@/store/authStore';
import { PlayersCarousel } from '@/components/GameDetails/PlayersCarousel';
import { GameParticipant } from '@/types';

interface TrainersListProps {
  show: boolean;
}

export const TrainersList = ({ show }: TrainersListProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { users, fetchPlayers } = usePlayersStore();

  useEffect(() => {
    if (show && user?.id) {
      fetchPlayers();
    }
  }, [show, user?.id, fetchPlayers]);

  const trainers = useMemo(() => {
    if (!user?.currentCity?.id) return [];

    return Object.values(users)
      .filter((player) => player.isTrainer === true)
      .map((player): GameParticipant => ({
        userId: player.id,
        role: 'PARTICIPANT',
        isPlaying: true,
        joinedAt: new Date().toISOString(),
        user: player,
      }));
  }, [users, user?.currentCity?.id]);

  if (trainers.length === 0) {
    return null;
  }

  return (
    <div
      className={`transition-all duration-300 ease-in-out overflow-hidden ${
        show
          ? 'max-h-96 opacity-100 translate-y-0 mb-0'
          : 'max-h-0 opacity-0 -translate-y-4 mb-0'
      }`}
    >
      <div className="px-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          {t('trainers.ourTrainers', { defaultValue: 'Our trainers' })}
        </h3>
        <PlayersCarousel
          participants={trainers}
          userId={user?.id}
          autoHideNames={false}
        />
      </div>
    </div>
  );
};
