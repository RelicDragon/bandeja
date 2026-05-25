import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, List } from 'lucide-react';
import type { Game } from '@/types';
import { buildLeagueHomeGameBracketPath } from '@/utils/leagueHomeBracket.util';
import { YourLeaguesHomeLeagueGameRow } from './YourLeaguesHomeLeagueGameRow';

interface YourLeaguesHomeSeasonScheduledGamesExpandableProps {
  hubGames: Game[];
  gamesUnreadCounts: Record<string, number>;
  expanded: boolean;
  onToggleExpanded: () => void;
  titleKey: 'home.leagueSeasonScheduledGames' | 'home.leagueSeasonUnscheduledGames';
}

export function YourLeaguesHomeSeasonScheduledGamesExpandable({
  hubGames,
  gamesUnreadCounts,
  expanded,
  onToggleExpanded,
  titleKey,
}: YourLeaguesHomeSeasonScheduledGamesExpandableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (hubGames.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50/90 dark:border-gray-700 dark:bg-gray-800/50">
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-gray-100/90 active:bg-gray-200/80 dark:hover:bg-gray-700/60 dark:active:bg-gray-700"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm dark:bg-gray-900 dark:text-gray-300">
          <List size={15} strokeWidth={2} aria-hidden />
        </div>
        <span className="min-w-0 flex-1 text-xs font-medium text-gray-700 dark:text-gray-200">
          {t(titleKey)}
        </span>
        <span className="shrink-0 rounded-full bg-gray-200/90 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-gray-700 dark:bg-gray-600/80 dark:text-gray-100">
          {hubGames.length}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`shrink-0 text-gray-500 transition-transform duration-200 ease-out motion-reduce:transition-none dark:text-gray-400 ${
            expanded ? '' : '-rotate-90'
          }`}
          aria-hidden
        />
      </button>
      <div
        className="grid border-t border-gray-200 transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none dark:border-gray-700"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-0.5 px-1.5 pb-2 pt-1">
            {hubGames.map((g) => (
              <YourLeaguesHomeLeagueGameRow
                key={g.id}
                game={g}
                unreadCount={gamesUnreadCounts[g.id] ?? 0}
                omitDatetimeNotSetLabel={titleKey === 'home.leagueSeasonUnscheduledGames'}
                onClick={() => {
                  const bracketPath = buildLeagueHomeGameBracketPath(g);
                  navigate(bracketPath ?? `/games/${g.id}`);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
