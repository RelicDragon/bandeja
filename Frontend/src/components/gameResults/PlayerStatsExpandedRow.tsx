import { useTranslation } from 'react-i18next';
import { PlayerMatchDetail } from './playerStatsDetails';

interface PlayerStatsExpandedRowProps {
  details: PlayerMatchDetail[];
}

export const PlayerStatsExpandedRow = ({ details }: PlayerStatsExpandedRowProps) => {
  const { t } = useTranslation();

  if (details.length === 0) {
    return (
      <div className="px-4 pb-3 pt-1 text-xs text-gray-500 dark:text-gray-400">
        {t('gameResults.playerStatsNoMatches') || 'No played matches'}
      </div>
    );
  }

  return (
    <div className="px-4 pb-3 pt-1">
      <div className="flex flex-wrap gap-2">
        {details.map((detail) => (
          <div
            key={detail.matchId}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-300"
          >
            <span className="font-medium">
              {t('gameResults.round') || 'Round'} {detail.roundNumber}
            </span>
            <span className="text-gray-400 dark:text-gray-500">•</span>
            <span className="font-medium">
              {t('gameResults.match')?.replace('{{number}}', String(detail.matchNumber)) || `Match ${detail.matchNumber}`}
            </span>
            <span className="text-gray-400 dark:text-gray-500">•</span>
            <span>{detail.setsSummary}</span>
            {detail.result && (
              <span
                className={`ml-1 font-bold ${
                  detail.result === 'W'
                    ? 'text-green-600 dark:text-green-400'
                    : detail.result === 'L'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {detail.result}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
