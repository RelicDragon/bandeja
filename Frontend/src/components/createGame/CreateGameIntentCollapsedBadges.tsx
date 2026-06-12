import { Ban, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GenderTeam } from '@/types';
import 'bootstrap-icons/font/bootstrap-icons.css';

export function GenderTeamIconBadge({ genderTeams }: { genderTeams: GenderTeam }) {
  if (genderTeams === 'MIX_PAIRS') {
    return (
      <span className="inline-flex h-5 items-center justify-center gap-0.5 rounded-full bg-gradient-to-r from-blue-500 to-pink-500 px-1.5 dark:from-blue-600 dark:to-pink-600">
        <i className="bi bi-gender-male text-[9px] text-white" aria-hidden />
        <i className="bi bi-gender-female -ml-0.5 text-[9px] text-white" aria-hidden />
      </span>
    );
  }

  const isMen = genderTeams === 'MEN';
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
        isMen ? 'bg-blue-500 dark:bg-blue-600' : 'bg-pink-500 dark:bg-pink-600'
      }`}
    >
      <i
        className={`bi ${isMen ? 'bi-gender-male' : 'bi-gender-female'} text-[10px] text-white`}
        aria-hidden
      />
    </span>
  );
}

function RatingGameBadge({ isRatingGame }: { isRatingGame: boolean }) {
  const { t } = useTranslation();

  if (isRatingGame) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
        <TrendingUp size={10} strokeWidth={2.5} aria-hidden />
        {t('games.affectsRating')}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800 dark:bg-purple-900/40 dark:text-purple-400">
      <Ban size={10} strokeWidth={2.5} aria-hidden />
      {t('games.noRating')}
    </span>
  );
}

type Props = {
  genderTeams?: GenderTeam;
  isRatingGame: boolean;
  showRating?: boolean;
};

export function CreateGameIntentCollapsedBadges({
  genderTeams,
  isRatingGame,
  showRating = true,
}: Props) {
  const showGender = genderTeams != null && genderTeams !== 'ANY';

  if (!showGender && !showRating) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {showGender ? <GenderTeamIconBadge genderTeams={genderTeams!} /> : null}
      {showRating ? <RatingGameBadge isRatingGame={isRatingGame} /> : null}
    </div>
  );
}
