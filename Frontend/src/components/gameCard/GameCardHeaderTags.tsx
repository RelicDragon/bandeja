import { useTranslation } from 'react-i18next';
import { Users, Ban, Award, Lock } from 'lucide-react';
import type { Game } from '@/types';
import type { GameCardMyParticipationBadge } from '@/utils/gameCardMyParticipationBadge';
import { genderTeamsSummaryLabelKey } from '@/utils/genderTeamsSummaryLabel';

interface GameCardHeaderTagsProps {
  game: Game;
  sportTags: React.ReactNode;
  myParticipationBadge: GameCardMyParticipationBadge | null;
}

const PILL = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium';

const PARTICIPATION_PILL_CLASSES: Record<GameCardMyParticipationBadge, string> = {
  owner: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  admin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  guest: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  invited: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  in_queue: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  playing: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  non_playing: 'bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300',
};

function participationLabelKey(badge: GameCardMyParticipationBadge): string {
  switch (badge) {
    case 'owner':
      return 'games.owner';
    case 'admin':
      return 'games.admin';
    case 'guest':
      return 'games.statusGuest';
    case 'invited':
      return 'games.statusInvited';
    case 'in_queue':
      return 'games.statusInQueue';
    case 'playing':
      return 'games.badgePlaying';
    case 'non_playing':
      return 'games.statusNonPlaying';
  }
}

export const GameCardHeaderTags = ({
  game,
  sportTags,
  myParticipationBadge,
}: GameCardHeaderTagsProps) => {
  const { t } = useTranslation();

  return (
    <>
      {sportTags}
      {myParticipationBadge && (
        <span
          className={`${PILL} whitespace-nowrap ${PARTICIPATION_PILL_CLASSES[myParticipationBadge]}`}
        >
          {myParticipationBadge === 'playing'
            ? t('games.badgePlaying', { defaultValue: 'Playing' })
            : t(participationLabelKey(myParticipationBadge))}
        </span>
      )}
      {!game.isPublic && (
        <span
          className={`${PILL} bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400`}
        >
          <Lock size={12} />
          <span className="hidden sm:inline">{t('games.private')}</span>
        </span>
      )}
      {game.genderTeams && game.genderTeams !== 'ANY' && (
        <span
          className="flex shrink-0 items-center"
          title={t(genderTeamsSummaryLabelKey(game.genderTeams) ?? 'createGame.genderTeams.label')}
        >
          {game.genderTeams === 'MIX_PAIRS' ? (
            <span className="flex h-5 items-center justify-center gap-1 rounded-full bg-gradient-to-r from-blue-500 to-pink-500 px-2 dark:from-blue-600 dark:to-pink-600">
              <i className="bi bi-gender-male text-[10px] text-white"></i>
              <i className="bi bi-gender-female -ml-1 text-[10px] text-white"></i>
            </span>
          ) : (
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full ${
                game.genderTeams === 'MEN'
                  ? 'bg-blue-500 dark:bg-blue-600'
                  : 'bg-pink-500 dark:bg-pink-600'
              }`}
            >
              <i
                className={`bi ${game.genderTeams === 'MEN' ? 'bi-gender-male' : 'bi-gender-female'} text-xs text-white`}
              ></i>
            </span>
          )}
        </span>
      )}
      {!game.affectsRating && (
        <span
          className={`${PILL} bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400`}
        >
          <Ban size={12} />
          {t('games.noRating')}
        </span>
      )}
      {game.hasFixedTeams && (
        <span
          className={`${PILL} bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400`}
        >
          <span className="flex items-center">
            <Users size={12} />
            <Users size={12} className="-ml-1" />
          </span>
          <span className="hidden sm:inline">{t('games.fixedTeams')}</span>
        </span>
      )}
      {(game.status === 'STARTED' || game.status === 'FINISHED' || game.status === 'ARCHIVED') &&
        game.resultsStatus === 'FINAL' && (
          <span
            className={`${PILL} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400`}
          >
            <Award size={12} />
            {t('games.resultsAvailable')}
          </span>
        )}
    </>
  );
};
