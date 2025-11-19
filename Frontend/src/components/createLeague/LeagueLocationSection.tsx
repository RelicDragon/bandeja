import { MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CitySelectorModal, ClubModal } from '@/components';
import { Club, City } from '@/types';

interface LeagueLocationSectionProps {
  cities: City[];
  clubs: Club[];
  selectedCityId?: string;
  selectedClubId?: string;
  isCityModalOpen: boolean;
  isClubModalOpen: boolean;
  onSelectCity: (id: string) => void;
  onSelectClub: (id: string) => void;
  onOpenCityModal: () => void;
  onCloseCityModal: () => void;
  onOpenClubModal: () => void;
  onCloseClubModal: () => void;
}

export const LeagueLocationSection = ({
  cities,
  clubs,
  selectedCityId,
  selectedClubId,
  isCityModalOpen,
  isClubModalOpen,
  onSelectCity,
  onSelectClub,
  onOpenCityModal,
  onCloseCityModal,
  onOpenClubModal,
  onCloseClubModal,
}: LeagueLocationSectionProps) => {
  const { t } = useTranslation();

  const selectedCity = cities.find(c => c.id === selectedCityId);

  return (
    <>
      <CitySelectorModal
        isOpen={isCityModalOpen}
        onClose={onCloseCityModal}
        selectedId={selectedCityId}
        onSelect={onSelectCity}
      />
      <ClubModal
        isOpen={isClubModalOpen}
        onClose={onCloseClubModal}
        clubs={clubs}
        selectedId={selectedClubId || ''}
        onSelect={onSelectClub}
      />
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {t('createLeague.location')}
          </h2>
        </div>
        <div className="space-y-3">
          <div>
            <button
              onClick={onOpenCityModal}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-left hover:border-primary-500 transition-colors"
            >
              {selectedCity
                ? selectedCity.name
                : t('createLeague.selectCity')}
            </button>
          </div>
          {selectedCityId && (
            <div>
              <button
                onClick={onOpenClubModal}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-left hover:border-primary-500 transition-colors"
              >
                {selectedClubId
                  ? clubs.find(c => c.id === selectedClubId)?.name
                  : t('createGame.selectClub')}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

