import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card, GameCard, Button } from '@/components';
import { Game } from '@/types';
import { MapPin, Filter, ChevronLeft, ChevronRight, Bell, Dumbbell, Swords, Trophy } from 'lucide-react';
import { useNavigationStore } from '@/store/navigationStore';
import { format, startOfDay, addDays, subDays, startOfWeek } from 'date-fns';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { MonthCalendar } from './MonthCalendar';
import { TrainersList } from './TrainersList';
import { getGameFilters, setGameFilters, GameFilters } from '@/utils/gameFiltersStorage';

interface AvailableGamesSectionProps {
  availableGames: Game[];
  user: any;
  loading?: boolean;
  onJoin: (gameId: string, e: React.MouseEvent) => void;
  onMonthChange?: (month: number, year: number) => void;
  onDateRangeChange?: (startDate: Date, endDate: Date) => void;
  filters?: GameFilters;
  onFilterChange?: (key: keyof GameFilters, value: any) => void;
  onFiltersChange?: (updates: Partial<GameFilters>) => void;
}

export const AvailableGamesSection = ({
  availableGames,
  user,
  onJoin,
  onMonthChange,
  onDateRangeChange,
  filters: externalFilters,
  onFilterChange,
  onFiltersChange,
}: AvailableGamesSectionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setCurrentPage, setIsAnimating, findViewMode, setFindViewMode, requestFindGoToCurrent, setRequestFindGoToCurrent } = useNavigationStore();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [listViewStartDate, setListViewStartDate] = useState<Date>(new Date());
  const [userFilter, setUserFilter] = useState(false);
  const [trainingFilter, setTrainingFilter] = useState(false);
  const [tournamentFilter, setTournamentFilter] = useState(false);
  const [leaguesFilter, setLeaguesFilter] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const userFilterVal = externalFilters?.userFilter ?? userFilter;
  const trainingFilterVal = externalFilters?.trainingFilter ?? trainingFilter;
  const tournamentFilterVal = externalFilters?.tournamentFilter ?? tournamentFilter;
  const leaguesFilterVal = externalFilters?.leaguesFilter ?? leaguesFilter;

  const setUserFilterVal = (v: boolean) => (onFilterChange ? onFilterChange('userFilter', v) : setUserFilter(v));

  const setEntityFilters = (training: boolean, tournament: boolean, leagues: boolean) => {
    if (onFiltersChange) {
      onFiltersChange({ trainingFilter: training, tournamentFilter: tournament, leaguesFilter: leagues });
    } else {
      setTrainingFilter(training);
      setTournamentFilter(tournament);
      setLeaguesFilter(leagues);
    }
  };

  const handleEntityFilterClick = (type: 'training' | 'tournament' | 'leagues') => {
    if (type === 'training') {
      setEntityFilters(!trainingFilterVal, false, false);
    } else if (type === 'tournament') {
      setEntityFilters(false, !tournamentFilterVal, false);
    } else {
      setEntityFilters(false, false, !leaguesFilterVal);
    }
  };
  const lastDateRangeRef = useRef<{ start: string; end: string } | null>(null);

  useEffect(() => {
    const loadFilters = async () => {
      const filters = await getGameFilters();
      if (!externalFilters) {
        setUserFilter(filters.userFilter);
        setTrainingFilter(filters.trainingFilter);
        setTournamentFilter(filters.tournamentFilter ?? false);
        setLeaguesFilter(filters.leaguesFilter ?? false);
      }
      if (filters.activeTab) {
        setFindViewMode(filters.activeTab);
      }
      
      if (filters.listViewStartDate) {
        const restoredDate = new Date(filters.listViewStartDate);
        if (!isNaN(restoredDate.getTime())) {
          setListViewStartDate(restoredDate);
        }
      }
      
      setIsInitialized(true);
    };
    loadFilters();
  }, [setFindViewMode, externalFilters]);

  useEffect(() => {
    if (!isInitialized) return;

    const saveFilters = async () => {
      await setGameFilters({
        userFilter: userFilterVal,
        trainingFilter: trainingFilterVal,
        tournamentFilter: tournamentFilterVal,
        leaguesFilter: leaguesFilterVal,
        activeTab: findViewMode,
        listViewStartDate: findViewMode === 'list' ? listViewStartDate.toISOString() : undefined,
      });
    };
    saveFilters();
  }, [isInitialized, userFilterVal, trainingFilterVal, tournamentFilterVal, leaguesFilterVal, findViewMode, listViewStartDate]);

  const handleCityClick = () => {
    toast(t('games.switchCityInProfile'));
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const handleListNavigation = (direction: 'left' | 'right') => {
    if (direction === 'left') {
      setListViewStartDate(subDays(listViewStartDate, 7));
    } else {
      setListViewStartDate(addDays(listViewStartDate, 7));
    }
  };

  const getListDateRange = () => {
    const start = startOfDay(listViewStartDate);
    const end = startOfDay(addDays(listViewStartDate, 6));
    return { start, end };
  };

  useEffect(() => {
    if (!requestFindGoToCurrent) return;
    const mode = requestFindGoToCurrent;
    setRequestFindGoToCurrent(null);
    if (mode === 'calendar') {
      setSelectedDate(new Date());
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-calendar="true"]');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      const displaySettings = user ? resolveDisplaySettings(user) : resolveDisplaySettings(null);
      setListViewStartDate(startOfWeek(new Date(), { weekStartsOn: displaySettings.weekStart }));
    }
  }, [requestFindGoToCurrent, setRequestFindGoToCurrent, user]);

  useEffect(() => {
    if (!isInitialized || findViewMode !== 'list' || !onDateRangeChange) {
      if (findViewMode === 'calendar') {
        lastDateRangeRef.current = null;
      }
      return;
    }
    
    const start = startOfDay(listViewStartDate);
    const end = startOfDay(addDays(listViewStartDate, 6));
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    
    if (!lastDateRangeRef.current || 
        lastDateRangeRef.current.start !== startStr || 
        lastDateRangeRef.current.end !== endStr) {
      lastDateRangeRef.current = { start: startStr, end: endStr };
      onDateRangeChange(start, end);
    }
  }, [isInitialized, findViewMode, listViewStartDate, onDateRangeChange]);

  const getFilteredGames = () => {
    if (findViewMode === 'calendar') {
      return availableGames.filter(game => {
        const gameDate = startOfDay(new Date(game.startTime));
        const selectedDateStr = format(startOfDay(selectedDate), 'yyyy-MM-dd');
        const gameDateStr = format(gameDate, 'yyyy-MM-dd');
        
        if (gameDateStr !== selectedDateStr) {
          return false;
        }

        return applyCommonFilters(game);
      });
    } else {
      const { start, end } = getListDateRange();
      return availableGames.filter(game => {
        const gameDate = startOfDay(new Date(game.startTime));
        const gameDateStr = format(gameDate, 'yyyy-MM-dd');
        const startStr = format(start, 'yyyy-MM-dd');
        const endStr = format(end, 'yyyy-MM-dd');
        
        if (gameDateStr < startStr || gameDateStr > endStr) {
          return false;
        }

        return applyCommonFilters(game);
      });
    }
  };

  const applyCommonFilters = (game: Game) => {
    if (game.timeIsSet === false) {
      return false;
    }

    const organizer = game.entityType === 'TRAINING'
      ? (game.trainerId ? game.participants.find((p: any) => p.userId === game.trainerId) : null) || game.participants.find((p: any) => p.role === 'OWNER')
      : game.participants.find((p: any) => p.role === 'OWNER');
    if (organizer && user?.blockedUserIds?.includes(organizer.userId)) {
      return false;
    }

    const isPublic = game.isPublic;
    const isParticipant = user?.id && game.participants.some((p: any) => p.userId === user.id);
    const isLeagueGame = game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON';

    if (!isPublic && !isParticipant && !(leaguesFilterVal && isLeagueGame)) {
      return false;
    }

    if (userFilterVal) {
      const slotCount = game.participants.filter((p: any) => p.status === 'PLAYING').length;
      if (slotCount >= game.maxParticipants) {
        return false;
      }

      if (user?.level) {
        const userLevel = user.level;
        const minLevel = game.minLevel || 0;
        const maxLevel = game.maxLevel || 10;
        
        if (userLevel < minLevel || userLevel > maxLevel) {
          return false;
        }
      }
    }

    if (trainingFilterVal && game.entityType !== 'TRAINING') {
      return false;
    }

    if (trainingFilterVal && user?.favoriteTrainerId) {
      const trainer = game.trainerId === user.favoriteTrainerId ? game.participants.find((p: any) => p.userId === game.trainerId) : null;
      if (!trainer) return false;
    }

    if (tournamentFilterVal && game.entityType !== 'TOURNAMENT') {
      return false;
    }

    if (leaguesFilterVal && !isLeagueGame) {
      return false;
    }

    return true;
  };

  const filteredGames = getFilteredGames();

  const handleSubscriptionsClick = () => {
    setIsAnimating(true);
    setCurrentPage('gameSubscriptions');
    navigate('/game-subscriptions', { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <div className="mt-2">
      <div className="mb-4">
        <div className="flex items-center justify-center mb-3">
          <button 
            onClick={handleCityClick}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <MapPin size={20} className="text-primary-600 dark:text-primary-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {user?.currentCity?.name || t('auth.selectCity')}
            </h2>
          </button>
        </div>
        <div className="flex items-center gap-2 mb-3 max-w-md mx-auto">
          <button
            onClick={() => handleEntityFilterClick('training')}
            className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-colors ${
              trainingFilterVal
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <Dumbbell size={18} className={trainingFilterVal ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'} fill={trainingFilterVal ? 'currentColor' : 'none'} />
            <span className="text-sm font-medium">{t('games.training', { defaultValue: 'Training' })}</span>
          </button>
          <button
            onClick={() => setUserFilterVal(!userFilterVal)}
            className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-colors ${
              userFilterVal
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <Filter size={18} className={userFilterVal ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'} fill={userFilterVal ? 'currentColor' : 'none'} />
            <span className="text-sm font-medium">{t('games.availableForMe', { defaultValue: 'Available for me' })}</span>
          </button>
        </div>
        <div className="flex items-center gap-2 mb-3 max-w-md mx-auto">
          <button
            onClick={() => handleEntityFilterClick('tournament')}
            className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-colors ${
              tournamentFilterVal
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <Swords size={18} className={tournamentFilterVal ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'} fill={tournamentFilterVal ? 'currentColor' : 'none'} />
            <span className="text-sm font-medium">{t('games.entityTypes.TOURNAMENT', { defaultValue: 'Tournament' })}</span>
          </button>
          <button
            onClick={() => handleEntityFilterClick('leagues')}
            className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-colors ${
              leaguesFilterVal
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <Trophy size={18} className={leaguesFilterVal ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'} fill={leaguesFilterVal ? 'currentColor' : 'none'} />
            <span className="text-sm font-medium">{t('games.entityTypes.LEAGUE', { defaultValue: 'Leagues' })}</span>
          </button>
        </div>
        <div 
          className={`max-w-md mx-auto mb-3 overflow-hidden transition-all duration-300 ease-in-out ${
            userFilterVal 
              ? 'max-h-20 opacity-100' 
              : 'max-h-0 opacity-0'
          }`}
        >
          <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-3">
            <p className="text-xs text-primary-700 dark:text-primary-300 text-center">
              {t('games.availableForMeHint', { defaultValue: 'Showing games with available slots and suitable level limits' })}
            </p>
          </div>
        </div>
      </div>

      <TrainersList show={trainingFilterVal} />

      {findViewMode === 'calendar' ? (
        <>
          <MonthCalendar
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            availableGames={availableGames}
            userFilter={userFilterVal}
            trainingFilter={trainingFilterVal}
            tournamentFilter={tournamentFilterVal}
            leaguesFilter={leaguesFilterVal}
            favoriteTrainerId={user?.favoriteTrainerId}
            onMonthChange={onMonthChange}
            onDateRangeChange={onDateRangeChange}
          />
          
          {filteredGames.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">
                {trainingFilterVal ? t('games.noTrainingFound', { defaultValue: 'No training found' }) : tournamentFilterVal ? t('games.noTournamentFound', { defaultValue: 'No tournament found' }) : leaguesFilterVal ? t('games.noLeaguesFound', { defaultValue: 'No leagues found' }) : t('games.noGamesFound')}
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  user={user}
                  showChatIndicator={false}
                  showJoinButton={true}
                  onJoin={onJoin}
                  isInitiallyCollapsed={false}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              onClick={() => handleListNavigation('left')}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronLeft size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {format(getListDateRange().start, 'dd.MM.yyyy')} - {format(getListDateRange().end, 'dd.MM.yyyy')}
            </div>
            <button
              onClick={() => handleListNavigation('right')}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          
          {filteredGames.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">
                {trainingFilterVal ? t('games.noTrainingFound', { defaultValue: 'No training found' }) : tournamentFilterVal ? t('games.noTournamentFound', { defaultValue: 'No tournament found' }) : leaguesFilterVal ? t('games.noLeaguesFound', { defaultValue: 'No leagues found' }) : t('games.noGamesFound')}
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  user={user}
                  showChatIndicator={false}
                  showJoinButton={true}
                  onJoin={onJoin}
                  isInitiallyCollapsed={false}
                />
              ))}
            </div>
          )}
        </>
      )}
      
      <div className="mt-6 flex justify-center">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubscriptionsClick}
          className="flex items-center gap-2"
        >
          <div className="relative inline-flex items-center justify-center w-4 h-4">
            <Bell className="w-4 h-4 animate-bell-pulse relative z-10" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="absolute w-8 h-8 rounded-full border-2 border-current opacity-0 animate-ring-1"></div>
              <div className="absolute w-8 h-8 rounded-full border-2 border-current opacity-0 animate-ring-2"></div>
            </div>
          </div>
          {t('gameSubscriptions.wantToBeNotified', { defaultValue: 'Want to be notified when new games are created?' })}
        </Button>
      </div>
    </div>
  );
};
