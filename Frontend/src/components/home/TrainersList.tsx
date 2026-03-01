import { useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayersStore } from '@/store/playersStore';
import { useAuthStore } from '@/store/authStore';
import { PlayerAvatar } from '@/components';
import { TrainerRatingBadge } from '@/components/TrainerRatingBadge';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';
import { usersApi } from '@/api';
import { BasicUser } from '@/types';
import { Game } from '@/types';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useRef, useState } from 'react';

interface TrainersListProps {
  show: boolean;
  availableGames?: Game[];
}

export const TrainersList = ({ show, availableGames = [] }: TrainersListProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const { openPlayerCard } = usePlayerCardModal();
  const { users, fetchPlayers } = usePlayersStore();
  const carouselRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  useEffect(() => {
    if (show && user?.id) {
      fetchPlayers();
    }
  }, [show, user?.id, fetchPlayers]);

  const trainingCountByTrainerId = useMemo(() => {
    return availableGames.reduce<Record<string, number>>((acc, game) => {
      if (game.entityType !== 'TRAINING' || !game.trainerId) return acc;
      acc[game.trainerId] = (acc[game.trainerId] ?? 0) + 1;
      return acc;
    }, {});
  }, [availableGames]);

  const trainers = useMemo(() => {
    if (!user?.currentCity?.id) return [];

    const list = Object.values(users)
      .filter((player): player is BasicUser & { isTrainer: boolean } => player.isTrainer === true);

    return [...list].sort((a, b) => (trainingCountByTrainerId[b.id] ?? 0) - (trainingCountByTrainerId[a.id] ?? 0));
  }, [users, user?.currentCity?.id, trainingCountByTrainerId]);

  const selectedTrainer = useMemo(
    () => (user?.favoriteTrainerId ? trainers.find((t) => t.id === user.favoriteTrainerId) : null),
    [trainers, user?.favoriteTrainerId]
  );

  const [displayedTrainer, setDisplayedTrainer] = useState<BasicUser | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  useEffect(() => {
    if (selectedTrainer) {
      setDisplayedTrainer(selectedTrainer);
      setHintVisible(false);
      const t = setTimeout(() => setHintVisible(true), 0);
      return () => clearTimeout(t);
    } else if (displayedTrainer) {
      const t = setTimeout(() => {
        setDisplayedTrainer(null);
        setHintVisible(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [selectedTrainer, displayedTrainer]);

  const handleSelectTrainer = useCallback(
    async (trainerId: string) => {
      if (!user) return;
      const newId = user.favoriteTrainerId === trainerId ? null : trainerId;
      try {
        const { data } = await usersApi.updateProfile({ favoriteTrainerId: newId });
        updateUser(data);
        listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        // ignore
      }
    },
    [user, updateUser]
  );

  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;

    const checkScroll = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setShowLeftFade(scrollLeft > 0);
      setShowRightFade(scrollLeft < scrollWidth - clientWidth - 1);
    };

    checkScroll();
    container.addEventListener('scroll', checkScroll);
    const ro = new ResizeObserver(checkScroll);
    ro.observe(container);
    return () => {
      container.removeEventListener('scroll', checkScroll);
      ro.disconnect();
    };
  }, [trainers]);

  if (trainers.length === 0) {
    return null;
  }

  return (
    <div
      ref={listRef}
      className={`transition-all duration-300 ease-in-out overflow-hidden scroll-mt-20 ${
        show
          ? 'max-h-96 opacity-100 translate-y-0 mb-0'
          : 'max-h-0 opacity-0 -translate-y-4 mb-0'
      }`}
    >
      <div className="px-4 relative max-w-md mx-auto">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          {t('trainers.ourTrainers', { defaultValue: 'Our trainers' })}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {t('trainers.selectToFilterHint', { defaultValue: 'Tap a trainer to filter trainings by them' })}
        </p>
        <div className="relative">
          <div
            ref={carouselRef}
            className="overflow-x-auto overflow-y-hidden scrollbar-hide flex gap-2 pb-4"
          >
            {trainers.map((trainer) => {
              const isSelected = user?.favoriteTrainerId === trainer.id;
              const trainingCount = trainingCountByTrainerId[trainer.id] ?? 0;
              const hasTrainings = trainingCount > 0;
              return (
                <button
                  key={trainer.id}
                  type="button"
                  onClick={() => (hasTrainings ? handleSelectTrainer(trainer.id) : openPlayerCard(trainer.id))}
                  className={`relative flex-shrink-0 flex flex-col items-center min-w-[5rem] w-max p-2 rounded-xl border-2 transition-all ${
                    !hasTrainings
                      ? 'opacity-60 border-gray-200 dark:border-gray-600 hover:opacity-100'
                      : isSelected
                        ? 'bg-primary-100 dark:bg-primary-900/40 border-primary-500 dark:border-primary-400'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-600'
                  }`}
                >
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      openPlayerCard(trainer.id);
                    }}
                    className="cursor-pointer [&>div]:pointer-events-none"
                  >
                    <PlayerAvatar
                      player={trainer}
                      asDiv
                      smallLayout
                      showName={false}
                    />
                  </span>
                  {trainingCount > 0 && (
                    <span className="absolute top-0 right-0 z-10 min-w-[1.25rem] h-5 px-1 rounded-full bg-primary-500 dark:bg-primary-600 text-white text-[10px] font-semibold flex items-center justify-center shadow-xl shadow-black/30">
                      {trainingCount}
                    </span>
                  )}
                  <div className="mt-1 text-xs min-h-8 w-full text-gray-700 dark:text-gray-300 break-words text-center leading-tight flex flex-col items-center justify-start gap-0.5">
                    <span className="text-center truncate leading-none max-w-20">{trainer.firstName || ''}</span>
                    <span className="text-center truncate leading-none max-w-20">{trainer.lastName || ''}</span>
                    {trainer.verbalStatus && (
                      <span className="verbal-status max-w-20 block">
                        {trainer.verbalStatus}
                      </span>
                    )}
                    <TrainerRatingBadge trainer={trainer} size="sm" showReviewCount={true} />
                  </div>
                </button>
              );
            })}
          </div>
          {showLeftFade && (
            <>
              <div className="absolute top-0 bottom-4 left-0 w-6 bg-gradient-to-r from-white from-0% to-transparent dark:from-gray-900 pointer-events-none z-10" />
              <button
                type="button"
                onClick={() => carouselRef.current?.scrollBy({ left: -120, behavior: 'smooth' })}
                className="absolute left-0 top-10 w-6 h-6 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center z-20"
              >
                <ChevronLeft size={14} />
              </button>
            </>
          )}
          {showRightFade && (
            <>
              <div className="absolute top-0 bottom-4 right-0 w-6 bg-gradient-to-l from-white from-0% to-transparent dark:from-gray-900 pointer-events-none z-10" />
              <button
                type="button"
                onClick={() => carouselRef.current?.scrollBy({ left: 120, behavior: 'smooth' })}
                className="absolute right-0 top-10 w-6 h-6 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center z-20"
              >
                <ChevronRight size={14} />
              </button>
            </>
          )}
        </div>
        {displayedTrainer && (
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden w-full ${
              show && selectedTrainer && hintVisible ? 'max-h-24 opacity-100 translate-y-0 -mt-2 mb-2' : 'max-h-0 opacity-0 -translate-y-4 mt-0 mb-0'
            }`}
          >
            <div className="w-fit flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <button
              type="button"
              onClick={() => user?.favoriteTrainerId && handleSelectTrainer(user.favoriteTrainerId)}
              className="flex-shrink-0 w-7 h-7 rounded-full border border-primary-300 dark:border-primary-600 bg-white dark:bg-gray-800 flex items-center justify-center text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
              aria-label={t('trainers.clearTrainerFilter', { defaultValue: 'Clear trainer filter' })}
            >
              <X size={14} />
            </button>
            <span className="[&>div]:pointer-events-none">
              <PlayerAvatar player={displayedTrainer} asDiv extrasmall fullHideName />
            </span>
            <div className="flex flex-col items-start">
              <span className="text-xs text-primary-600 dark:text-primary-400 leading-tight">
                {t('trainers.trainingsBy', { defaultValue: 'Trainings by' })}
              </span>
              <span className="text-sm text-primary-700 dark:text-primary-300 font-medium leading-tight">
                {[displayedTrainer.firstName, displayedTrainer.lastName].filter(Boolean).join(' ') || ''}
              </span>
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
