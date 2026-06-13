import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, List } from 'lucide-react';
import type { Game } from '@/types';
import { buildLeagueHomeGameBracketPath } from '@/utils/leagueHomeBracket.util';
import { YourLeaguesHomeLeagueGameRow } from './YourLeaguesHomeLeagueGameRow';

interface YourLeaguesHomeSeasonScheduledGamesExpandableProps {
  hubGames: Game[];
  gamesUnreadCounts: Record<string, number>;
  titleKey: 'home.leagueSeasonScheduledGames' | 'home.leagueSeasonUnscheduledGames';
}

export function YourLeaguesHomeSeasonScheduledGamesExpandable({
  hubGames,
  gamesUnreadCounts,
  titleKey,
}: YourLeaguesHomeSeasonScheduledGamesExpandableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  if (hubGames.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200/70 bg-gray-50/70 dark:border-gray-700/70 dark:bg-gray-800/40">
      <button
        type="button"
        className={`flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-gray-100/80 dark:hover:bg-gray-800/60 ${
          open ? 'border-b border-gray-200/60 bg-gray-100/50 dark:border-gray-700/60 dark:bg-gray-800/60' : ''
        }`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <List
          size={14}
          strokeWidth={2}
          className="shrink-0 text-gray-500 dark:text-gray-400"
          aria-hidden
        />
        <span className="min-w-0 flex-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
          {t(titleKey)}
        </span>
        <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-semibold tabular-nums text-gray-600 shadow-xs dark:bg-gray-900 dark:text-gray-300">
          {hubGames.length}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-400 transition-transform duration-300 dark:text-gray-500 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-2 p-2">
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
