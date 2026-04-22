import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayerMatchDetail } from './playerStatsDetails';
import { PlayerStatsMatchDetails } from './PlayerStatsMatchDetails';

interface PlayerStatsExpandedRowProps {
  details: PlayerMatchDetail[];
}

export const PlayerStatsExpandedRow = ({ details }: PlayerStatsExpandedRowProps) => {
  const { t } = useTranslation();
  const [expandedMatchIds, setExpandedMatchIds] = useState<Set<string>>(new Set());

  const toggleMatchExpanded = (matchId: string) => {
    setExpandedMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  };

  if (details.length === 0) {
    return (
      <div className="px-4 pb-3 pt-1 text-xs text-gray-500 dark:text-gray-400">
        {t('gameResults.playerStatsNoMatches') || 'No played matches'}
      </div>
    );
  }

  const showExpandAll =
    details.length > 1 && expandedMatchIds.size < details.length;

  const expandAllMatches = () => {
    setExpandedMatchIds(new Set(details.map((d) => d.matchId)));
  };

  return (
    <div className="px-4 pb-3 pt-1">
      {showExpandAll ? (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={expandAllMatches}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {t('gameResults.playerStatsExpandAllMatches')}
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {details.map((detail) => {
          const isExpanded = expandedMatchIds.has(detail.matchId);
          return (
            <div
              key={detail.matchId}
              className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-300"
            >
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => toggleMatchExpanded(detail.matchId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleMatchExpanded(detail.matchId);
                  }
                }}
                className="cursor-pointer inline-flex items-center gap-1.5"
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
                  <>
                    <span className="text-gray-400 dark:text-gray-500">•</span>
                    <span
                      className={`font-bold ${
                        detail.result === 'W'
                          ? 'text-green-600 dark:text-green-400'
                          : detail.result === 'L'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {detail.result}
                    </span>
                  </>
                )}
              </div>
              <div
                className={`grid transition-all duration-200 ease-out ${
                  isExpanded ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <PlayerStatsMatchDetails detail={detail} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
