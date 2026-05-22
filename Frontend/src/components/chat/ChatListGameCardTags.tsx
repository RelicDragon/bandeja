import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, Ban, Beer, Camera, Dumbbell, Lock, Swords, Trophy, Users } from 'lucide-react';
import { AnnouncedFireIcon } from '@/components/AnnouncedFireIcon';
import { GameStatusIcon } from '@/components/GameStatusIcon';
import type { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { getSportConfig } from '@/sport/sportRegistry';
import { getGameParticipationState } from '@/utils/gameParticipationState';
import { getGameCardMyParticipationBadge } from '@/utils/gameCardMyParticipationBadge';
import { getViewerPrimarySport, shouldShowGameCardSportGlyph } from '@/utils/findSportFilter';
import { parseGameSport } from '@/utils/gameSport';

type Props = {
  game: Game;
  userId: string | undefined;
};

const tagClass =
  'inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded shrink-0';

export function ChatListGameCardTags({ game, userId }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const gameSport = useMemo(() => parseGameSport(game.sport), [game.sport]);
  const showSportTag = useMemo(
    () => shouldShowGameCardSportGlyph(game.sport, getViewerPrimarySport(user), undefined),
    [game.sport, user]
  );
  const sportConfig = getSportConfig(gameSport);
  const participants = game.participants ?? [];
  const participation = getGameParticipationState(participants, userId, game);
  const myBadge = getGameCardMyParticipationBadge(participants, userId);
  const owner = participants.find((p) => p.role === 'OWNER');
  const showFireIcon =
    owner?.user?.isPremium === true &&
    game.status === 'ANNOUNCED' &&
    ((['GAME', 'TOURNAMENT', 'TRAINING', 'LEAGUE_SEASON'].includes(game.entityType) &&
      !participation.isFull) ||
      game.entityType === 'BAR');

  return (
    <div className="flex items-center gap-1 flex-wrap min-w-0">
      {showFireIcon ? (
        <AnnouncedFireIcon />
      ) : (
        <GameStatusIcon status={game.status} className="[&_svg]:w-3.5 [&_svg]:h-3.5" />
      )}

      {(game.photosCount ?? 0) > 0 && (
        <span className={`${tagClass} bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400`}>
          <Camera size={10} />
          {game.photosCount}
        </span>
      )}
      {!game.isPublic && (
        <span className={`${tagClass} bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400`}>
          <Lock size={10} />
        </span>
      )}
      {showSportTag && (
        <span className={`${tagClass} bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400`}>
          <span className="leading-none" aria-hidden>
            {sportConfig.icon}
          </span>
          <span>{t(sportConfig.labelKey)}</span>
        </span>
      )}
      {game.genderTeams && game.genderTeams !== 'ANY' && (
        <span className="shrink-0">
          {game.genderTeams === 'MIX_PAIRS' ? (
            <span className="h-4 px-1 rounded-full bg-gradient-to-r from-blue-500 to-pink-500 flex items-center gap-0.5">
              <i className="bi bi-gender-male text-white text-[8px]" />
              <i className="bi bi-gender-female text-white text-[8px] -ml-0.5" />
            </span>
          ) : (
            <span
              className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                game.genderTeams === 'MEN' ? 'bg-blue-500' : 'bg-pink-500'
              }`}
            >
              <i
                className={`bi ${game.genderTeams === 'MEN' ? 'bi-gender-male' : 'bi-gender-female'} text-white text-[8px]`}
              />
            </span>
          )}
        </span>
      )}
      {myBadge === 'owner' && (
        <span className={`${tagClass} bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400`}>
          {t('games.owner')}
        </span>
      )}
      {myBadge === 'admin' && (
        <span className={`${tagClass} bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400`}>
          {t('games.admin')}
        </span>
      )}
      {myBadge === 'guest' && (
        <span className={`${tagClass} bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400`}>
          {t('games.statusGuest')}
        </span>
      )}
      {myBadge === 'invited' && (
        <span className={`${tagClass} bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400`}>
          {t('games.statusInvited')}
        </span>
      )}
      {myBadge === 'in_queue' && (
        <span className={`${tagClass} bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400`}>
          {t('games.statusInQueue')}
        </span>
      )}
      {myBadge === 'playing' && (
        <span
          className={`${tagClass} whitespace-nowrap bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400`}
        >
          {t('games.badgePlaying', { defaultValue: 'Playing' })}
        </span>
      )}
      {myBadge === 'non_playing' && (
        <span className={`${tagClass} bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300`}>
          {t('games.statusNonPlaying')}
        </span>
      )}
      {game.entityType !== 'GAME' && (
        <span className={`${tagClass} bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400`}>
          {game.entityType === 'TOURNAMENT' && <Swords size={10} />}
          {(game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON') && <Trophy size={10} />}
          {game.entityType === 'TRAINING' && <Dumbbell size={10} />}
          {game.entityType === 'BAR' && <Beer size={10} />}
          {t(`games.entityTypes.${game.entityType}`)}
        </span>
      )}
      {!game.affectsRating && (
        <span className={`${tagClass} bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400`}>
          <Award size={10} />
          <Ban size={10} />
        </span>
      )}
      {game.hasFixedTeams && (
        <span className={`${tagClass} bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400`}>
          <Users size={10} />
          <Users size={10} className="-ml-1" />
        </span>
      )}
      {(game.status === 'STARTED' || game.status === 'FINISHED') &&
        game.resultsStatus === 'FINAL' && (
          <span className={`${tagClass} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400`}>
            <Award size={10} />
            {t('games.resultsAvailable')}
          </span>
        )}
      {game.entityType !== 'LEAGUE' &&
        game.entityType !== 'LEAGUE_SEASON' &&
        game.entityType !== 'TRAINING' &&
        game.name &&
        game.gameType !== 'CLASSIC' && (
          <span className={`${tagClass} bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400`}>
            {t(`games.gameTypes.${game.gameType}`)}
          </span>
        )}
    </div>
  );
}
