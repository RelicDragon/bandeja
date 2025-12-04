import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Game, Club, EntityType } from '@/types';
import { addHours } from 'date-fns';
import { GameStartSection } from '@/components/createGame/GameStartSection';
import { useGameTimeDuration } from '@/hooks/useGameTimeDuration';

interface TimeDurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: Game;
  clubs: Club[];
  onSave: (data: { startTime: Date; endTime: Date }) => void;
}

export const TimeDurationModal = ({ isOpen, onClose, game, clubs, onSave }: TimeDurationModalProps) => {
  const { t } = useTranslation();
  const [isClosing, setIsClosing] = useState(false);
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
      setIsClosing(false);
      document.body.style.overflow = 'hidden';
      
      setTimeout(() => {
        setDisableAutoAdjust(false);
      }, 200);
    } else if (!isOpen) {
      document.body.style.overflow = '';
      setDisableAutoAdjust(true);
    }

    return () => {
      if (!isOpen) {
        document.body.style.overflow = '';
      }
    };
  }, [isOpen, initialValues.initialDate.getTime(), initialValues.initialTime, initialValues.initialDuration, setSelectedDate, setSelectedTime, setDuration]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

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
      handleClose();
    } catch (error) {
      console.error('Error saving time/duration:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-opacity duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className={`relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col transition-transform duration-200 ${
          isClosing ? 'scale-95' : 'scale-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {game.entityType === 'TOURNAMENT' ? t('createGame.gameStartTournament') :
             game.entityType === 'LEAGUE' ? t('createGame.gameStartLeague') :
             t('createGame.gameStart')}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

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

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={handleClose}
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
        </div>
      </div>
    </div>,
    document.body
  );
};

