import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { GameStatusIcon } from '@/components/GameStatusIcon';
import { Users, Dumbbell, Beer, Ban, Award, Lock, Swords, Trophy, Camera } from 'lucide-react';
import type { Game } from '@/types';
import type { GameCardMyParticipationBadge } from '@/utils/gameCardMyParticipationBadge';

interface GameCardHeaderTagsProps {
  game: Game;
  showStatusIcon: boolean;
  sportTags: React.ReactNode;
  showPhotoCountBadge: boolean;
  myParticipationBadge: GameCardMyParticipationBadge | null;
  showEntityTypePill: boolean;
  skipStatusAndSport?: boolean;
}

export const GameCardHeaderTags = ({
  game,
  showStatusIcon,
  sportTags,
  showPhotoCountBadge,
  myParticipationBadge,
  showEntityTypePill,
  skipStatusAndSport = false,
}: GameCardHeaderTagsProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <>
      {!skipStatusAndSport && showStatusIcon && <GameStatusIcon status={game.status} />}
      {!skipStatusAndSport && sportTags}
      {showPhotoCountBadge && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/games/${game.id}/chat`);
          }}
          className="px-2.5 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1 shadow-[0_0_8px_rgba(168,85,247,0.4)] dark:shadow-[0_0_8px_rgba(168,85,247,0.5)] hover:bg-purple-200 dark:hover:bg-purple-900/50 hover:shadow-[0_0_12px_rgba(168,85,247,0.6)] dark:hover:shadow-[0_0_12px_rgba(168,85,247,0.7)] hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
        >
          <Camera size={12} />
          {game.photosCount}
        </button>
      )}
      {!game.isPublic && (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
          <Lock size={12} />
          <span className="hidden sm:inline">{t('games.private')}</span>
        </span>
      )}
      {game.genderTeams && game.genderTeams !== 'ANY' && (
        <div className="flex items-center gap-1">
          {game.genderTeams === 'MIX_PAIRS' ? (
            <div className="h-6 px-2 rounded-full bg-gradient-to-r from-blue-500 to-pink-500 dark:from-blue-600 dark:to-pink-600 flex items-center justify-center gap-1">
              <i className="bi bi-gender-male text-white text-[10px]"></i>
              <i className="bi bi-gender-female -ml-1 text-white text-[10px]"></i>
            </div>
          ) : (
            <div
              className={`w-4 h-4 rounded-full flex items-center justify-center ${
                game.genderTeams === 'MEN'
                  ? 'bg-blue-500 dark:bg-blue-600'
                  : 'bg-pink-500 dark:bg-pink-600'
              }`}
            >
              <i
                className={`bi ${game.genderTeams === 'MEN' ? 'bi-gender-male' : 'bi-gender-female'} text-white text-xs`}
              ></i>
            </div>
          )}
        </div>
      )}
      {myParticipationBadge === 'owner' && (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          {t('games.owner')}
        </span>
      )}
      {myParticipationBadge === 'admin' && (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
          {t('games.admin')}
        </span>
      )}
      {myParticipationBadge === 'guest' && (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          {t('games.statusGuest')}
        </span>
      )}
      {myParticipationBadge === 'invited' && (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
          {t('games.statusInvited')}
        </span>
      )}
      {myParticipationBadge === 'in_queue' && (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400">
          {t('games.statusInQueue')}
        </span>
      )}
      {myParticipationBadge === 'playing' && (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
          {t('games.badgePlaying', { defaultValue: 'Playing' })}
        </span>
      )}
      {myParticipationBadge === 'non_playing' && (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300">
          {t('games.statusNonPlaying')}
        </span>
      )}
      {showEntityTypePill && (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400 flex items-center gap-1">
          {game.entityType === 'TOURNAMENT' && <Swords size={12} />}
          {(game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON') && <Trophy size={12} />}
          {game.entityType === 'TRAINING' && <Dumbbell size={12} />}
          {game.entityType === 'BAR' && <Beer size={12} />}
          {t(`games.entityTypes.${game.entityType}`)}
        </span>
      )}
      {!game.affectsRating && (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
          <Ban size={12} />
          {t('games.noRating')}
        </span>
      )}
      {game.hasFixedTeams && (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
          <div className="flex items-center">
            <Users size={12} />
            <Users size={12} />
          </div>
          <span className="hidden sm:inline">{t('games.fixedTeams')}</span>
        </span>
      )}
      {(game.status === 'STARTED' || game.status === 'FINISHED' || game.status === 'ARCHIVED') &&
        game.resultsStatus === 'FINAL' && (
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
            <Award size={12} />
            {t('games.resultsAvailable')}
          </span>
        )}
    </>
  );
};
