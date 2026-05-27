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
    <div className="border-t border-gray-200/80 dark:border-gray-700/80">
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-gray-100/80 active:bg-gray-100 dark:hover:bg-gray-800/60 dark:active:bg-gray-800"
      >
        <List
          size={14}
          strokeWidth={2}
          className="shrink-0 text-gray-500 dark:text-gray-400"
          aria-hidden
        />
        <span className="min-w-0 flex-1 text-xs font-medium text-gray-600 dark:text-gray-300">
          {t(titleKey)}
        </span>
        <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-gray-900/5 px-1.5 text-[10px] font-semibold tabular-nums text-gray-600 dark:bg-white/10 dark:text-gray-300">
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
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-0.5 border-t border-gray-200/60 px-1 pb-1.5 pt-0.5 dark:border-gray-700/60">
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
