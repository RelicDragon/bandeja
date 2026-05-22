import { useState, useEffect, useMemo } from 'react';
import { Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { parseSport } from '@shared/sport';
import { Court, EntityType, type Sport } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { getSportConfig } from '@/sport/sportRegistry';
import {
  filterCourtsBySport,
  getDistinctCourtSports,
  resolveDefaultCourtSportTab,
  shouldShowCourtSportTabs,
  sportLabelKey,
} from '@/utils/courtSport';

interface CourtModalProps {
  isOpen: boolean;
  onClose: () => void;
  courts: Court[];
  selectedId: string;
  onSelect: (id: string) => void;
  entityType?: EntityType;
  showNotBookedOption?: boolean;
  preferredSport?: Sport | null;
  onSportTabChange?: (sport: Sport) => void;
}

export const CourtModal = ({
  isOpen,
  onClose,
  courts,
  selectedId,
  onSelect,
  entityType,
  showNotBookedOption = true,
  preferredSport,
  onSportTabChange,
}: CourtModalProps) => {
  const { t } = useTranslation();
  const [internalIsOpen, setInternalIsOpen] = useState(isOpen);

  const clubSports = useMemo(() => getDistinctCourtSports(courts), [courts]);
  const showSportTabs = shouldShowCourtSportTabs(courts);

  const [activeSportTab, setActiveSportTab] = useState<Sport | undefined>(() =>
    resolveDefaultCourtSportTab(clubSports, preferredSport),
  );

  useEffect(() => {
    if (isOpen) {
      setInternalIsOpen(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveSportTab(resolveDefaultCourtSportTab(clubSports, preferredSport));
  }, [isOpen, clubSports, preferredSport]);

  const visibleCourts = useMemo(() => {
    if (showSportTabs && activeSportTab) {
      return filterCourtsBySport(courts, activeSportTab);
    }
    if (!showSportTabs && preferredSport) {
      return filterCourtsBySport(courts, preferredSport);
    }
    return courts;
  }, [courts, showSportTabs, activeSportTab, preferredSport]);

  const handleClose = () => {
    setInternalIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    handleClose();
  };

  const handleSportTab = (sportId: string) => {
    const sport = parseSport(sportId);
    setActiveSportTab(sport);
    onSportTabChange?.(sport);
  };

  const isBar = entityType === 'BAR';
  const selectText = isBar ? t('createGame.selectHall') : t('createGame.selectCourt');
  const noAvailableText = isBar ? t('createGame.noHallsAvailable') : t('createGame.noCourtsAvailable');

  const sportTabs = clubSports.map((sport) => {
    const config = getSportConfig(sport);
    return {
      id: sport,
      label: `${config.icon} ${t(sportLabelKey(sport))}`,
    };
  });

  return (
    <Dialog open={internalIsOpen} onClose={handleClose} modalId="court-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{selectText}</DialogTitle>
        </DialogHeader>
        {showSportTabs && sportTabs.length > 0 && (
          <div className="flex-shrink-0 px-1 pt-2">
            <SegmentedSwitch
              tabs={sportTabs}
              activeId={activeSportTab ?? sportTabs[0].id}
              onChange={handleSportTab}
              showOnlyActiveTabText={false}
              layoutId="court-modal-sport"
              className="mx-4 mb-1 w-auto max-w-full"
            />
          </div>
        )}
        <div className="overflow-y-auto scrollbar-auto flex-1 p-4">
          {visibleCourts.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">{noAvailableText}</p>
          ) : (
            <div className="space-y-2">
              {showNotBookedOption && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect('notBooked');
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    selectedId === 'notBooked'
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium">{t('createGame.notBookedYet')}</div>
                </button>
              )}
              {visibleCourts.map((court) => (
                <button
                  key={court.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(court.id);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    selectedId === court.id
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium flex items-center gap-1.5">
                        {court.name}
                        {court.isIndoor && (
                          <span title="Indoor court">
                            <Home
                              size={14}
                              className={selectedId === court.id ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}
                            />
                          </span>
                        )}
                      </div>
                      {court.courtType && <div className="text-sm opacity-80 mt-0.5">{court.courtType}</div>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
