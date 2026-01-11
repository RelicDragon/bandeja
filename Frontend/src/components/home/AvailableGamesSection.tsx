import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card, GameCard, Button } from '@/components';
import { Game } from '@/types';
import { MapPin, Filter, ChevronLeft, ChevronRight, Bell, Dumbbell } from 'lucide-react';
import { useNavigationStore } from '@/store/navigationStore';
import { format, startOfDay, addDays, subDays } from 'date-fns';
import { useHeaderStore } from '@/store/headerStore';
import { MonthCalendar } from './MonthCalendar';
import { TrainersList } from './TrainersList';
import { getGameFilters, setGameFilters } from '@/utils/gameFiltersStorage';

interface AvailableGamesSectionProps {
  availableGames: Game[];
  user: any;
  loading: boolean;
  onJoin: (gameId: string, e: React.MouseEvent) => void;
  onMonthChange?: (month: number, year: number) => void;
  onDateRangeChange?: (startDate: Date, endDate: Date) => void;
}

export const AvailableGamesSection = ({
  availableGames,
  user,
  onJoin,
  onMonthChange,
  onDateRangeChange,
}: AvailableGamesSectionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setCurrentPage, setIsAnimating } = useNavigationStore();
  const [activeTab, setActiveTab] = useState<'calendar' | 'list'>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [listViewStartDate, setListViewStartDate] = useState<Date>(new Date());
  const [userFilter, setUserFilter] = useState(false);
  const [trainingFilter, setTrainingFilter] = useState(false);
  const setSelectedDateForCreateGame = useHeaderStore((state) => state.setSelectedDateForCreateGame);
  const lastDateRangeRef = useRef<{ start: string; end: string } | null>(null);

  useEffect(() => {
    const loadFilters = async () => {
      const filters = await getGameFilters();
      setUserFilter(filters.userFilter);
      setTrainingFilter(filters.trainingFilter);
      setActiveTab(filters.activeTab);
    };
    loadFilters();
  }, []);

  useEffect(() => {
    const saveFilters = async () => {
      await setGameFilters({
        userFilter,
        trainingFilter,
        activeTab,
      });
    };
    saveFilters();
  }, [userFilter, trainingFilter, activeTab]);

  useEffect(() => {
    console.log('AvailableGamesSection - storing date for create game:', selectedDate);
    setSelectedDateForCreateGame(selectedDate);
  }, [selectedDate, setSelectedDateForCreateGame]);


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
    if (activeTab === 'list' && onDateRangeChange) {
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
    } else if (activeTab === 'calendar') {
      lastDateRangeRef.current = null;
    }
  }, [activeTab, listViewStartDate, onDateRangeChange]);

  const getFilteredGames = () => {
    if (activeTab === 'calendar') {
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

    const gameOwner = game.participants.find((p: any) => p.role === 'OWNER');
    if (gameOwner && user?.blockedUserIds?.includes(gameOwner.userId)) {
      return false;
    }

    const isPublic = game.isPublic;
    const isParticipant = user?.id && game.participants.some((p: any) => p.userId === user.id);
    
    if (!isPublic && !isParticipant) {
      return false;
    }

    if (userFilter) {
      if (game.participants.length >= game.maxParticipants) {
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

    if (trainingFilter && game.entityType !== 'TRAINING') {
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
        <div className="mb-4 flex justify-center">
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
        <div className="flex items-center justify-center mb-3 relative">
          <button 
            onClick={handleCityClick}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <MapPin size={20} className="text-primary-600 dark:text-primary-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {user?.currentCity?.name || t('auth.selectCity')}
            </h2>
          </button>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button
              onClick={() => setTrainingFilter(!trainingFilter)}
              className={`p-2 rounded-lg transition-colors ${
                trainingFilter
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Dumbbell size={20} className={trainingFilter ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'} fill={trainingFilter ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => setUserFilter(!userFilter)}
              className={`p-2 rounded-lg transition-colors ${
                userFilter
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Filter size={20} className={userFilter ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'} fill={userFilter ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
      </div>

      <TrainersList show={trainingFilter} />

      <div className="flex items-center gap-2 mb-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
            activeTab === 'calendar'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          {t('games.calendar') || 'Calendar'}
        </button>
        <button
          onClick={() => setActiveTab('list')}
          className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
            activeTab === 'list'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          {t('games.list') || 'List'}
        </button>
      </div>

      {activeTab === 'calendar' ? (
        <>
          <MonthCalendar
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            availableGames={availableGames}
            userFilter={userFilter}
            trainingFilter={trainingFilter}
            onMonthChange={onMonthChange}
            onDateRangeChange={onDateRangeChange}
          />
          
          {filteredGames.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">
                {trainingFilter ? t('games.noTrainingFound', { defaultValue: 'No training found' }) : t('games.noGamesFound')}
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
                {trainingFilter ? t('games.noTrainingFound', { defaultValue: 'No training found' }) : t('games.noGamesFound')}
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
    </div>
  );
};
