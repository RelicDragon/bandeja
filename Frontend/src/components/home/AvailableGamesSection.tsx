import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Card, GameCard, DateSelectorWithCount } from '@/components';
import { Game } from '@/types';
import { MapPin } from 'lucide-react';
import { format, startOfDay, addDays } from 'date-fns';

interface AvailableGamesSectionProps {
  availableGames: Game[];
  user: any;
  loading: boolean;
  onJoin: (gameId: string, e: React.MouseEvent) => void;
}

export const AvailableGamesSection = ({
  availableGames,
  user,
  loading,
  onJoin,
}: AvailableGamesSectionProps) => {
  const { t } = useTranslation();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [filterByLevel, setFilterByLevel] = useState(false);

  // Check if selected date is within the fixed date range (next 7 days)
  const fixedDates = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
  const isSelectedDateInFixedRange = fixedDates.some(date =>
    format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
  );


  const handleCityClick = () => {
    toast(t('games.switchCityInProfile'));
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    // Calendar button will show "Select from calendar" when date is in fixed range
  };

  const handleCalendarDateSelect = (date: Date) => {
    setSelectedDate(date);
    // Calendar button will show the selected date when it's not in fixed range
  };

  const handleCalendarClick = () => {
    setShowDatePicker(true);
  };

  const handleCloseDatePicker = () => {
    setShowDatePicker(false);
  };

  const filteredGames = availableGames.filter(game => {
    const gameDate = startOfDay(new Date(game.startTime));
    const selectedDateStr = format(startOfDay(selectedDate), 'yyyy-MM-dd');
    const gameDateStr = format(gameDate, 'yyyy-MM-dd');
    
    // Filter by date
    if (gameDateStr !== selectedDateStr) {
      return false;
    }

    // Filter by level if toggle is on
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
    <div 
      className={`mt-8 transition-all duration-500 ease-in-out overflow-hidden ${
        loading
          ? 'max-h-0 opacity-0 transform -translate-y-4'
          : 'max-h-screen opacity-100 transform translate-y-0'
      }`}
    >
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
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
        
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2">
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
        </div>
      </div>

      <DateSelectorWithCount
        selectedDate={selectedDate}
        onDateSelect={handleDateSelect}
        onCalendarDateSelect={handleCalendarDateSelect}
        onCalendarClick={handleCalendarClick}
        showCalendarAsSelected={showDatePicker || !isSelectedDateInFixedRange}
        availableGames={availableGames}
        showDatePicker={showDatePicker}
        onCloseDatePicker={handleCloseDatePicker}
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

