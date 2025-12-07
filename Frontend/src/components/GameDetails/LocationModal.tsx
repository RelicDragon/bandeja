import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Club, Court, Game } from '@/types';
import { ClubModal } from '@/components/ClubModal';
import { CourtModal } from '@/components/CourtModal';
import { ToggleSwitch } from '@/components';
import { courtsApi } from '@/api';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: Game;
  clubs: Club[];
  courts: Court[];
  onSave: (data: { clubId: string; courtId: string; hasBookedCourt: boolean }) => void;
  onCourtsChange?: (courts: Court[]) => void;
}

export const LocationModal = ({ isOpen, onClose, game, clubs, courts, onSave, onCourtsChange }: LocationModalProps) => {
  const { t } = useTranslation();
  const [isClosing, setIsClosing] = useState(false);
  const [clubId, setClubId] = useState(game.clubId || '');
  const [courtId, setCourtId] = useState(game.courtId || '');
  const [hasBookedCourt, setHasBookedCourt] = useState(game.hasBookedCourt || false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isCourtModalOpen, setIsCourtModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [modalCourts, setModalCourts] = useState<Court[]>(courts);
  const [isLoadingCourts, setIsLoadingCourts] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setClubId(game.clubId || '');
      setCourtId(game.courtId || '');
      setHasBookedCourt(game.hasBookedCourt || false);
      if (courts.length > 0 || !game.clubId) {
        setModalCourts(courts);
      }
      setIsClosing(false);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, game, courts]);

  useEffect(() => {
    const fetchCourts = async () => {
      if (!clubId || !isOpen) return;
      
      setIsLoadingCourts(true);
      try {
        const response = await courtsApi.getByClubId(clubId);
        setModalCourts(response.data);
        if (onCourtsChange) {
          onCourtsChange(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch courts:', error);
        setModalCourts([]);
      } finally {
        setIsLoadingCourts(false);
      }
    };

    if (!isOpen) return;

    if (clubId) {
      if (clubId === game.clubId && courts.length > 0) {
        setModalCourts(courts);
        setIsLoadingCourts(false);
      } else {
        fetchCourts();
      }
    } else {
      setModalCourts([]);
      setIsLoadingCourts(false);
    }
  }, [clubId, isOpen, game.clubId, courts, onCourtsChange]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ clubId, courtId, hasBookedCourt });
      handleClose();
    } catch (error) {
      console.error('Error saving location:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const locationLabel = game?.entityType === 'LEAGUE_SEASON' ? t('createGame.locationLeague') : t('createGame.location');

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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{locationLabel}</h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('createGame.selectClub')}
            </label>
            <button
              onClick={() => setIsClubModalOpen(true)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-left hover:border-primary-500 transition-colors"
            >
              {clubId
                ? clubs.find(c => c.id === clubId)?.name
                : t('createGame.selectClub')}
            </button>
          </div>

          {clubId && !(game?.entityType === 'BAR' && modalCourts.length === 1) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {game?.entityType === 'BAR' ? t('createGame.selectHall') : t('createGame.selectCourt')}
              </label>
              <button
                onClick={() => setIsCourtModalOpen(true)}
                disabled={isLoadingCourts}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-left hover:border-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingCourts
                  ? t('app.loading')
                  : courtId === 'notBooked' || !courtId
                    ? t('createGame.notBookedYet')
                    : modalCourts.find(c => c.id === courtId)?.name || t('createGame.notBookedYet')}
              </button>
            </div>
          )}

          {courtId && courtId !== 'notBooked' && (
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {game?.entityType === 'BAR' ? t('createGame.hasBookedHall') : t('createGame.hasBookedCourt')}
              </span>
              <ToggleSwitch
                checked={hasBookedCourt}
                onChange={setHasBookedCourt}
              />
            </div>
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
            disabled={isSaving}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      {isClubModalOpen && createPortal(
        <div 
          className="fixed inset-0 z-[10000]" 
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          <ClubModal
            isOpen={isClubModalOpen}
            onClose={() => setIsClubModalOpen(false)}
            clubs={clubs}
            selectedId={clubId}
            onSelect={(id) => {
              setClubId(id);
              setCourtId('');
              setIsClubModalOpen(false);
            }}
          />
        </div>,
        document.body
      )}

      {isCourtModalOpen && (
        <CourtModal
          isOpen={isCourtModalOpen}
          onClose={() => setIsCourtModalOpen(false)}
          courts={modalCourts}
          selectedId={courtId || 'notBooked'}
          onSelect={(id) => {
            setCourtId(id === 'notBooked' ? '' : id);
            setIsCourtModalOpen(false);
          }}
          entityType={game.entityType}
        />
      )}
    </div>,
    document.body
  );
};

