import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { Card, GameCard } from '@/components';
import { Game } from '@/types';
import { MapPin, Filter } from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import { useHeaderStore } from '@/store/headerStore';
import { MonthCalendar } from './MonthCalendar';

interface AvailableGamesSectionProps {
  availableGames: Game[];
  user: any;
  loading: boolean;
  onJoin: (gameId: string, e: React.MouseEvent) => void;
  onMonthChange?: (month: number, year: number) => void;
  onDateRangeChange?: (startDate: Date, endDate: Date) => void;
  showArchived?: boolean;
  onShowArchivedChange?: (showArchived: boolean) => void;
}

export const AvailableGamesSection = ({
  availableGames,
  user,
  onJoin,
  onMonthChange,
  onDateRangeChange,
  showArchived = false,
  onShowArchivedChange,
}: AvailableGamesSectionProps) => {
  const { t } = useTranslation();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filterByLevel, setFilterByLevel] = useState(true);
  const [filterByAvailableSlots, setFilterByAvailableSlots] = useState(true);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [modalPosition, setModalPosition] = useState<{ top: number; right: number } | null>(null);
  const setSelectedDateForCreateGame = useHeaderStore((state) => state.setSelectedDateForCreateGame);

  useEffect(() => {
    console.log('AvailableGamesSection - storing date for create game:', selectedDate);
    setSelectedDateForCreateGame(selectedDate);
  }, [selectedDate, setSelectedDateForCreateGame]);


  const updateModalPosition = useCallback(() => {
    if (!filterButtonRef.current) return;
    const rect = filterButtonRef.current.getBoundingClientRect();
    setModalPosition({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        (filterButtonRef.current && filterButtonRef.current.contains(target)) ||
        (modalRef.current && modalRef.current.contains(target))
      ) {
        return;
      }
      setShowFilterModal(false);
    };

    if (showFilterModal) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilterModal]);

  useEffect(() => {
    if (!showFilterModal) return;
    updateModalPosition();

    const handleReposition = () => {
      updateModalPosition();
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [showFilterModal, updateModalPosition]);

  const handleCityClick = () => {
    toast(t('games.switchCityInProfile'));
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const filteredGames = availableGames.filter(game => {
    const gameDate = startOfDay(new Date(game.startTime));
    const selectedDateStr = format(startOfDay(selectedDate), 'yyyy-MM-dd');
    const gameDateStr = format(gameDate, 'yyyy-MM-dd');
    
    if (gameDateStr !== selectedDateStr) {
      return false;
    }

    const isPublic = game.isPublic;
    const isParticipant = user?.id && game.participants.some((p: any) => p.userId === user.id);
    
    if (!isPublic && !isParticipant) {
      return false;
    }

    if (filterByAvailableSlots && game.participants.length >= game.maxParticipants) {
      return false;
    }

    if (filterByLevel && user?.level) {
      const userLevel = user.level;
      const minLevel = game.minLevel || 0;
      const maxLevel = game.maxLevel || 10;
      
      if (userLevel < minLevel || userLevel > maxLevel) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="mt-8">
      <div className="mb-4">
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
          <button
            ref={filterButtonRef}
            onClick={() => setShowFilterModal(!showFilterModal)}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Filter size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {showFilterModal && modalPosition && typeof document !== 'undefined' && createPortal(
        <div
          ref={modalRef}
          className="z-[1000] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          style={{
            position: 'fixed',
            top: modalPosition.top,
            right: modalPosition.right,
            minWidth: '200px',
          }}
        >
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('games.suitableGamesForMe')}
              </label>
              <button
                onClick={() => setFilterByLevel(!filterByLevel)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  filterByLevel 
                    ? 'bg-primary-600' 
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    filterByLevel ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('games.haveAvailableSlots')}
              </label>
              <button
                onClick={() => setFilterByAvailableSlots(!filterByAvailableSlots)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  filterByAvailableSlots 
                    ? 'bg-primary-600' 
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    filterByAvailableSlots ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {onShowArchivedChange && (
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('games.showArchived')}
                </label>
                <button
                  onClick={() => onShowArchivedChange(!showArchived)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    showArchived 
                      ? 'bg-primary-600' 
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      showArchived ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      <MonthCalendar
        selectedDate={selectedDate}
        onDateSelect={handleDateSelect}
        availableGames={availableGames}
        filterByLevel={filterByLevel}
        filterByAvailableSlots={filterByAvailableSlots}
        user={user}
        onMonthChange={onMonthChange}
        onDateRangeChange={onDateRangeChange}
      />
      
      {filteredGames.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">{t('games.noGamesFound')}</p>
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
              isInitiallyCollapsed={true}
            />
          ))}
        </div>
      )}
    </div>
  );
};
