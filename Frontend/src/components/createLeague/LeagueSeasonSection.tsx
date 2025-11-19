import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, addDays } from 'date-fns';
import { RangeSlider, AvatarUpload, DateSelector } from '@/components';
import { CalendarComponent } from '@/components/Calendar';

interface LeagueSeasonSectionProps {
  seasonName: string;
  playerLevelRange: [number, number];
  maxParticipants: number;
  startDate: Date | null;
  seasonAvatar?: string | null;
  onSeasonNameChange: (name: string) => void;
  onPlayerLevelRangeChange: (range: [number, number]) => void;
  onMaxParticipantsChange: (num: number) => void;
  onStartDateChange: (date: Date | null) => void;
  onSeasonAvatarUpload?: (avatarFile: File, originalFile: File) => Promise<void>;
  onSeasonAvatarRemove?: () => Promise<void>;
  isUploadingAvatar?: boolean;
}

export const LeagueSeasonSection = ({
  seasonName,
  playerLevelRange,
  maxParticipants,
  startDate,
  seasonAvatar,
  onSeasonNameChange,
  onPlayerLevelRangeChange,
  onMaxParticipantsChange,
  onStartDateChange,
  onSeasonAvatarUpload,
  onSeasonAvatarRemove,
  isUploadingAvatar = false,
}: LeagueSeasonSectionProps) => {
  const { t } = useTranslation();
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Use today's date as default if startDate is null
  const selectedDate = startDate || new Date();

  // Check if selected date is within the fixed date range (next 7 days)
  const fixedDates = Array.from({ length: 8 }, (_, i) => addDays(new Date(), i));
  const isSelectedDateInFixedRange = fixedDates.some(date =>
    format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
  );

  const handleDateSelect = (date: Date) => {
    onStartDateChange(date);
  };

  const handleCalendarClick = () => {
    setShowDatePicker(true);
  };

  const handleCloseDatePicker = () => {
    setShowDatePicker(false);
  };

  const handleCalendarDateSelect = (date: Date) => {
    onStartDateChange(date);
    setShowDatePicker(false);
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {t('createLeague.season')}
        </h2>
      </div>
      <div className="space-y-4">
        {onSeasonAvatarUpload && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              {t('createLeague.seasonAvatar')}
            </label>
            <div className="flex justify-center">
              <AvatarUpload
                currentAvatar={seasonAvatar || undefined}
                isGameAvatar={true}
                onUpload={onSeasonAvatarUpload}
                onRemove={onSeasonAvatarRemove}
                disabled={isUploadingAvatar}
              />
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
            {t('createLeague.seasonName')}
          </label>
          <input
            type="text"
            value={seasonName}
            onChange={(e) => onSeasonNameChange(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
            placeholder={t('createLeague.seasonNamePlaceholder')}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
            {t('createLeague.playerLevel')}
          </label>
          <RangeSlider
            min={1.0}
            max={7.0}
            value={playerLevelRange}
            onChange={onPlayerLevelRangeChange}
            step={0.1}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
            {t('createLeague.maxParticipants')}
          </label>
          <div className="relative">
            <input
              type="number"
              min="4"
              max="999"
              value={maxParticipants}
              onChange={(e) => {
                const num = parseInt(e.target.value);
                if (!isNaN(num) && num >= 4 && num <= 999) {
                  onMaxParticipantsChange(num);
                } else if (e.target.value === '') {
                  onMaxParticipantsChange(4);
                }
              }}
              placeholder={t('createLeague.maxParticipantsPlaceholder')}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              4-999
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
            {t('createLeague.startDate')}
          </label>
          <DateSelector
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            onCalendarClick={handleCalendarClick}
            showCalendarAsSelected={showDatePicker || !isSelectedDateInFixedRange}
            hideTodayIfNoSlots={false}
            hasTimeSlotsForToday={true}
            hideCurrentDateIndicator={false}
          />
          {showDatePicker && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseDatePicker} />
              <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full border border-gray-200 dark:border-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {t('createGame.selectDate')}
                </h3>
                <CalendarComponent
                  selectedDate={selectedDate}
                  onDateSelect={handleCalendarDateSelect}
                  minDate={new Date()}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

