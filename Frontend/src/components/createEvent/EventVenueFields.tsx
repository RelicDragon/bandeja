import { ChevronRight, MapPin, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ClubModal, ClubAvatar } from '@/components';
import type { Club, Sport } from '@/types';

type EventVenueFieldsProps = {
  clubs: Club[];
  selectedClubId: string;
  venueText: string;
  isClubModalOpen: boolean;
  cityId?: string;
  preferredSport?: Sport;
  onVenueTextChange: (value: string) => void;
  onSelectClub: (id: string) => void;
  onClearClub: () => void;
  onOpenClubModal: () => void;
  onCloseClubModal: () => void;
  onVenueCityChange?: (cityId: string) => void;
};

export function EventVenueFields({
  clubs,
  selectedClubId,
  venueText,
  isClubModalOpen,
  cityId,
  preferredSport,
  onVenueTextChange,
  onSelectClub,
  onClearClub,
  onOpenClubModal,
  onCloseClubModal,
  onVenueCityChange,
}: EventVenueFieldsProps) {
  const { t } = useTranslation();
  const club = clubs.find((c) => c.id === selectedClubId);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MapPin size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="section-title">{t('createEvent.venue')}</h2>
      </div>
      <ClubModal
        isOpen={isClubModalOpen}
        onClose={onCloseClubModal}
        clubs={clubs}
        selectedId={selectedClubId}
        onSelect={(id) => {
          onSelectClub(id);
          onCloseClubModal();
        }}
        cityId={cityId}
        preferredSport={preferredSport}
        entityType="EVENT"
        onVenueCityChange={onVenueCityChange}
      />
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          {t('createEvent.venueOrClub')}
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenClubModal}
            disabled={!cityId}
            className="min-w-0 flex-1 flex items-center gap-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-start text-sm text-gray-900 dark:text-white hover:border-primary-500 disabled:opacity-50"
          >
            {club ? (
              <>
                <ClubAvatar club={club} className="h-10 w-[3.75rem] shrink-0" />
                <span className="min-w-0 flex-1 truncate">{club.name}</span>
              </>
            ) : (
              <span className="text-gray-500 dark:text-gray-400">{t('createEvent.selectClub')}</span>
            )}
            <ChevronRight size={16} className="shrink-0 text-gray-400" />
          </button>
          {club ? (
            <button
              type="button"
              onClick={onClearClub}
              className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              aria-label={t('common.remove', { defaultValue: 'Remove' })}
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          {t('createEvent.venueText')}
        </label>
        <input
          type="text"
          value={venueText}
          onChange={(e) => onVenueTextChange(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
        />
      </div>
    </div>
  );
}
