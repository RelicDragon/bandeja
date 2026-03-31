import { useTranslation } from 'react-i18next';
import { PlayerMatchDetail } from './playerStatsDetails';

interface PlayerStatsMatchDetailsProps {
  detail: PlayerMatchDetail;
}

export const PlayerStatsMatchDetails = ({ detail }: PlayerStatsMatchDetailsProps) => {
  const { t } = useTranslation();

  return (
    <div className="mt-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 p-2">
      <div className="text-[11px] text-gray-600 dark:text-gray-300">
        <span className="font-medium">A:</span> {detail.teamAPlayers.join(' / ')}
      </div>
      <div className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">
        <span className="font-medium">B:</span> {detail.teamBPlayers.join(' / ')}
      </div>
      <div className="mt-2 space-y-1">
        {detail.sets.map((set, idx) => (
          <div key={`${detail.matchId}-set-${idx}`} className="text-[11px] text-gray-700 dark:text-gray-300">
            <span className="font-medium">{t('gameResults.set') || 'Set'} {idx + 1}:</span>{' '}
            {set.myScore}-{set.oppScore}
            {set.isTieBreak ? ' TB' : ''}
          </div>
        ))}
      </div>
    </div>
  );
};
