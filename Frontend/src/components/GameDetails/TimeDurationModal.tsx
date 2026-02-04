import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Game, Club, EntityType } from '@/types';
import { addHours } from 'date-fns';
import { GameStartSection } from '@/components/createGame/GameStartSection';
import { useGameTimeDuration } from '@/hooks/useGameTimeDuration';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';

interface TimeDurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: Game;
  clubs: Club[];
  onSave: (data: { startTime: Date; endTime: Date }) => void;
}

export const TimeDurationModal = ({ isOpen, onClose, game, clubs, onSave }: TimeDurationModalProps) => {
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const prevIsOpenRef = useRef(false);

  const clubId = game.clubId || '';
  
  const initialValues = useMemo(() => {
    const initialDate = game.startTime ? new Date(game.startTime) : new Date();
    const initialTime = game.startTime ? new Date(game.startTime).toTimeString().slice(0, 5) : '';
    const initialDuration = game.startTime && game.endTime
      ? (new Date(game.endTime).getTime() - new Date(game.startTime).getTime()) / (1000 * 60 * 60)
      : 2;
    return { initialDate, initialTime, initialDuration };
  }, [game.startTime, game.endTime]);

  const [disableAutoAdjust, setDisableAutoAdjust] = useState(true);

  const {
    selectedDate,
    setSelectedDate,
    selectedTime,
    setSelectedTime,
    duration,
    setDuration,
    showPastTimes,
    setShowPastTimes,
    generateTimeOptions,
    generateTimeOptionsForDate,
    canAccommodateDuration,
    getAdjustedStartTime,
    getTimeSlotsForDuration,
    isSlotHighlighted,
  } = useGameTimeDuration({
    clubs,
    selectedClub: clubId,
    initialDate: initialValues.initialDate,
    showPastTimes: false,
    disableAutoAdjust,
  });

  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (isOpen && !wasOpen) {
      setDisableAutoAdjust(true);
      setSelectedDate(initialValues.initialDate);
      setSelectedTime(initialValues.initialTime);
      setDuration(initialValues.initialDuration);
      
      setTimeout(() => {
        setDisableAutoAdjust(false);
      }, 200);
    } else if (!isOpen) {
      setDisableAutoAdjust(true);
    }
  }, [isOpen, initialValues, setSelectedDate, setSelectedTime, setDuration]);

  const getDurationLabel = (dur: number) => {
    if (dur === Math.floor(dur)) {
      return t('createGame.hours', { count: dur });
    } else {
      const hours = Math.floor(dur);
      const minutes = (dur % 1) * 60;
      return t('createGame.hoursMinutes', { hours, minutes });
    }
  };

  const handleSave = async () => {
    if (!selectedTime || selectedTime === '') {
      return;
    }

    setIsSaving(true);
    try {
      const selectedClubData = clubs.find(c => c.id === clubId);
      const { createDateFromClubTime } = await import('@/hooks/useGameTimeDuration');
      const startTime = createDateFromClubTime(selectedDate, selectedTime, selectedClubData);
      const endTime = addHours(startTime, duration);

      await onSave({ startTime, endTime });
      onClose();
    } catch (error) {
      console.error('Error saving time/duration:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="time-duration-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {game.entityType === 'TOURNAMENT' ? t('createGame.gameStartTournament') :
             game.entityType === 'LEAGUE' ? t('createGame.gameStartLeague') :
             t('createGame.gameStart')}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 p-4">
          {!clubId ? (
            <div className="px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm text-center">
              {t('createGame.selectClubFirst')}
            </div>
          ) : (
            <GameStartSection
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              duration={duration}
              showPastTimes={showPastTimes}
              showDatePicker={showDatePicker}
              selectedClub={clubId}
              club={clubs.find(c => c.id === clubId)}
              generateTimeOptions={generateTimeOptions}
              generateTimeOptionsForDate={generateTimeOptionsForDate}
              canAccommodateDuration={canAccommodateDuration}
              getAdjustedStartTime={getAdjustedStartTime}
              getTimeSlotsForDuration={getTimeSlotsForDuration}
              isSlotHighlighted={isSlotHighlighted}
              getDurationLabel={getDurationLabel}
              onDateSelect={(date) => {
                setSelectedDate(date);
              }}
              onCalendarClick={() => setShowDatePicker(true)}
              onToggleShowPastTimes={setShowPastTimes}
              onCloseDatePicker={() => setShowDatePicker(false)}
              onTimeSelect={setSelectedTime}
              onDurationChange={setDuration}
              entityType={game.entityType as EntityType}
              dateInputRef={dateInputRef}
              compact={true}
            />
          )}
        </div>

        <DialogFooter className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !selectedTime || !clubId}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

