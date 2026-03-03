import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, startOfDay } from 'date-fns';
import { Calendar, MapPin, Users, Plane, Swords, Trophy, Dumbbell, Beer } from 'lucide-react';
import { Card } from '@/components';
import { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { getGameTimeDisplay, getClubTimezone, getDateLabelInClubTz } from '@/utils/gameTimeDisplay';
import { formatDate } from '@/utils/dateFormat';

interface UpcomingGamesListProps {
  games: Game[];
}

interface DateGroup {
  dateStr: string;
  label: string;
  games: Game[];
}

export const UpcomingGamesList = ({ games }: UpcomingGamesListProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { translateCity } = useTranslatedGeo();
  const displaySettings = user ? resolveDisplaySettings(user) : resolveDisplaySettings(null);
  const userCityId = user?.currentCity?.id || user?.currentCityId;

  const grouped = useMemo(() => {
    const map = new Map<string, Game[]>();
    for (const g of games) {
      const key = format(startOfDay(new Date(g.startTime)), 'yyyy-MM-dd');
      const arr = map.get(key) || [];
      arr.push(g);
      map.set(key, arr);
    }
    const result: DateGroup[] = [];
    for (const [dateStr, dateGames] of map) {
      const sample = dateGames[0];
      const clubTz = getClubTimezone(sample);
      const label = clubTz
        ? getDateLabelInClubTz(sample.startTime, clubTz, displaySettings, t)
        : formatDate(sample.startTime, 'EEE, d MMM');
      result.push({ dateStr, label, games: dateGames });
    }
    return result;
  }, [games, displaySettings, t]);

  if (grouped.length === 0) return null;

  return (
    <Card className="py-4">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 px-1">
        {t('home.upcomingGames', { defaultValue: 'Your upcoming games' })}
      </p>
      <div className="space-y-3">
        {grouped.map((group) => (
          <div key={group.dateStr}>
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5 px-1">
              {group.label}
            </p>
            <div className="space-y-1.5">
              {group.games.map((game) => (
                <UpcomingGameRow
                  key={game.id}
                  game={game}
                  userCityId={userCityId}
                  displaySettings={displaySettings}
                  translateCity={translateCity}
                  onClick={() => navigate(`/games/${game.id}`)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

interface UpcomingGameRowProps {
  game: Game;
  userCityId?: string;
  displaySettings: ReturnType<typeof resolveDisplaySettings>;
  translateCity: (cityId: string, cityName: string, country: string) => string;
  onClick: () => void;
}

const getEntityIcon = (entityType: Game['entityType']) => {
  switch (entityType) {
    case 'TOURNAMENT': return <Swords size={12} />;
    case 'LEAGUE':
    case 'LEAGUE_SEASON': return <Trophy size={12} />;
    case 'TRAINING': return <Dumbbell size={12} />;
    case 'BAR': return <Beer size={12} />;
    default: return null;
  }
};

const getEntityTagClasses = (entityType: Game['entityType']): string => {
  switch (entityType) {
    case 'TOURNAMENT':
      return 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-800';
    case 'LEAGUE':
    case 'LEAGUE_SEASON':
      return 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-800';
    case 'TRAINING':
      return 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-800';
    case 'BAR':
      return 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-800';
    default:
      return 'text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border-primary-200 dark:border-primary-800';
  }
};

const UpcomingGameRow = ({ game, userCityId, displaySettings, translateCity, onClick }: UpcomingGameRowProps) => {
  const { t } = useTranslation();
  const gameCityId = game.city?.id;
  const isDifferentCity = Boolean(gameCityId && userCityId && gameCityId !== userCityId);
  const clubName = game.court?.club?.name || game.club?.name;
  const playingCount = (game.participants ?? []).filter((p) => p.status === 'PLAYING').length;
  const showEntityType = game.entityType !== 'GAME';

  const timeDisplay = getGameTimeDisplay({
    game,
    displaySettings,
    startTime: game.startTime,
    endTime: game.endTime,
    kind: 'time',
    t,
  });

  return (
    <div
      className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer active:scale-[0.98] transition-all"
      onClick={onClick}
    >
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex-shrink-0">
        <Calendar size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {showEntityType && (
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium border rounded px-1 py-px flex-shrink-0 ${getEntityTagClasses(game.entityType)}`}>
              {getEntityIcon(game.entityType)}
              {t(`games.entityTypes.${game.entityType}`)}
            </span>
          )}
          {isDifferentCity && game.city?.name && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded px-1 py-px flex-shrink-0">
              <Plane size={8} />
              {translateCity(game.city.id, game.city.name, game.city.country)}
            </span>
          )}
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {timeDisplay.primaryText}
          </span>
          {clubName && (
            <>
              <span className="text-gray-300 dark:text-gray-600 text-xs">•</span>
              <span className="text-sm text-gray-600 dark:text-gray-400 truncate flex items-center gap-1">
                <MapPin size={12} className="flex-shrink-0" />
                {clubName}
              </span>
            </>
          )}
        </div>
        {game.name && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{game.name}</p>
        )}
      </div>
      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
        <Users size={12} />
        <span>{game.entityType === 'BAR' ? playingCount : `${playingCount}/${game.maxParticipants}`}</span>
      </div>
    </div>
  );
};
