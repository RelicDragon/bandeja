import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MatchDecidedBannerProps {
  teamAWins: number;
  teamBWins: number;
  scoreline: string;
}

export const MatchDecidedBanner = ({ teamAWins, teamBWins, scoreline }: MatchDecidedBannerProps) => {
  const { t } = useTranslation();
  const aWon = teamAWins > teamBWins;

  return (
    <div className="mx-auto my-1 flex max-w-md items-center gap-2 rounded-lg border border-green-200 bg-green-50/80 px-3 py-1.5 text-xs dark:border-green-800 dark:bg-green-900/20">
      <Trophy size={14} className="text-green-600 dark:text-green-400 flex-shrink-0" />
      <span className="font-semibold text-green-800 dark:text-green-200">
        {t('gameResults.matchDecided', { score: scoreline })}
      </span>
      <span className="ml-auto font-mono text-green-700 dark:text-green-300">
        {aWon ? `${teamAWins}-${teamBWins}` : `${teamAWins}-${teamBWins}`}
      </span>
    </div>
  );
};
