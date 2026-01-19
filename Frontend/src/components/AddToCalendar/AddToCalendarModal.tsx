import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Download, ExternalLink } from 'lucide-react';
import { buildGoogleCalendarUrl, downloadIcsEvent, addToNativeCalendar, type CalendarEventInput } from '@/utils/calendar';
import { isCapacitor } from '@/utils/capacitor';
import toast from 'react-hot-toast';
import { BaseModal } from '@/components/BaseModal';

interface AddToCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: CalendarEventInput;
  filename?: string;
}

export const AddToCalendarModal = ({ isOpen, onClose, event, filename }: AddToCalendarModalProps) => {
  const { t } = useTranslation();
  const [isAdding, setIsAdding] = useState(false);

  const googleUrl = useMemo(() => buildGoogleCalendarUrl(event), [event]);
  const safeFilename = filename || 'event.ics';
  const isNative = isCapacitor();

  const handleAddToNativeCalendar = async () => {
    setIsAdding(true);
    try {
      await addToNativeCalendar(event);
      toast.success(t('gameDetails.calendarEventAdded') || 'Event added to calendar');
      onClose();
    } catch (error) {
      toast.error(t('gameDetails.calendarError') || 'Failed to add event to calendar');
      console.error('Failed to add event to calendar:', error);
    } finally {
      setIsAdding(false);
    }
  };

  if (isNative) {
    return (
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        isBasic
        modalId="add-to-calendar-modal"
        showCloseButton={true}
        closeOnBackdropClick={true}
      >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays size={18} className="text-primary-600 dark:text-primary-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('gameDetails.addToCalendar')}
              </h3>
            </div>
          </div>

          <div className="mb-5">
            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">{event.title}</p>
            {event.location && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{event.location}</p>
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={handleAddToNativeCalendar}
              disabled={isAdding}
              className="w-full px-4 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isAdding ? (
                <span className="font-medium">{t('common.loading') || 'Adding...'}</span>
              ) : (
                <span className="font-medium">{t('gameDetails.addToCalendar')}</span>
              )}
            </button>

            <button
              onClick={onClose}
              className="w-full px-4 py-2 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-colors"
            >
              {t('common.close')}
            </button>
          </div>
      </BaseModal>
    );
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      isBasic
      modalId="add-to-calendar-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
      <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-primary-600 dark:text-primary-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('gameDetails.addToCalendar')}
            </h3>
          </div>
        </div>

        <div className="mb-5">
          <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">{event.title}</p>
          {event.location && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{event.location}</p>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              window.open(googleUrl, '_blank');
              onClose();
            }}
            className="w-full px-4 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 text-white transition-colors flex items-center justify-between"
          >
            <span className="font-medium">{t('gameDetails.openGoogleCalendar')}</span>
            <ExternalLink size={18} />
          </button>

          <button
            onClick={() => {
              downloadIcsEvent(event, safeFilename);
              onClose();
            }}
            className="w-full px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
          >
            <span className="font-medium">{t('gameDetails.addToOtherCalendar')}</span>
            <Download size={18} />
          </button>

          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
    </BaseModal>
  );
};


