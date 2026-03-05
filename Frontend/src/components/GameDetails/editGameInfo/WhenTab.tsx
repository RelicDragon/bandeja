import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Game, Club, EntityType } from '@/types';
import { GameStartSection } from '@/components/createGame/GameStartSection';

interface WhenTabProps {
  game: Game;
  clubs: Club[];
  clubId: string;
  selectedDate: Date;
  selectedTime: string;
  duration: number;
  showPastTimes: boolean;
  showDatePicker: boolean;
  onDateChange: (date: Date) => void;
  onTimeChange: (time: string) => void;
  onDurationChange: (duration: number) => void;
  onShowDatePickerChange: (show: boolean) => void;
  onShowPastTimesChange: (show: boolean) => void;
  generateTimeOptions: () => string[];
  generateTimeOptionsForDate: (date: Date) => string[];
  canAccommodateDuration: (time: string, duration: number) => boolean;
  getAdjustedStartTime: (clickedTime: string, duration: number) => string | null;
  getTimeSlotsForDuration: (startTime: string, duration: number) => string[];
  isSlotHighlighted: (time: string) => boolean;
  getDurationLabel: (dur: number) => string;
}

export const WhenTab = ({
  game,
  clubs,
  clubId,
  selectedDate,
  selectedTime,
  duration,
  showPastTimes,
  showDatePicker,
  onDateChange,
  onTimeChange,
  onDurationChange,
  onShowDatePickerChange,
  onShowPastTimesChange,
  generateTimeOptions,
  generateTimeOptionsForDate,
  canAccommodateDuration,
  getAdjustedStartTime,
  getTimeSlotsForDuration,
  isSlotHighlighted,
  getDurationLabel,
}: WhenTabProps) => {
  const { t } = useTranslation();
  const dateInputRef = useRef<HTMLInputElement>(null);

  if (!clubId) {
    return (
      <div className="px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm text-center">
        {t('createGame.selectClubFirst')}
      </div>
    );
  }

  return (
    <div className="py-1">
      <GameStartSection
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        duration={duration}
        showPastTimes={showPastTimes}
        showDatePicker={showDatePicker}
        selectedClub={clubId}
        club={clubs.find((c) => c.id === clubId)}
        generateTimeOptions={generateTimeOptions}
        generateTimeOptionsForDate={generateTimeOptionsForDate}
        canAccommodateDuration={canAccommodateDuration}
        getAdjustedStartTime={getAdjustedStartTime}
        getTimeSlotsForDuration={getTimeSlotsForDuration}
        isSlotHighlighted={isSlotHighlighted}
        getDurationLabel={getDurationLabel}
        onDateSelect={onDateChange}
        onCalendarClick={() => onShowDatePickerChange(true)}
        onToggleShowPastTimes={onShowPastTimesChange}
        onCloseDatePicker={() => onShowDatePickerChange(false)}
        onTimeSelect={onTimeChange}
        onDurationChange={onDurationChange}
        entityType={game.entityType as EntityType}
        dateInputRef={dateInputRef}
        compact={true}
      />
    </div>
  );
};
