import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Club, Court, Game } from '@/types';
import { ClubModal } from '@/components/ClubModal';
import { CourtModal } from '@/components/CourtModal';
import { ToggleSwitch } from '@/components';

export interface WhereTabState {
  clubId: string;
  courtId: string;
  hasBookedCourt: boolean;
}

interface WhereTabProps {
  game: Game;
  clubs: Club[];
  courts: Court[];
  state: WhereTabState;
  onChange: (patch: Partial<WhereTabState>) => void;
  isLoadingCourts?: boolean;
}

export const WhereTab = ({ game, clubs, courts, state, onChange, isLoadingCourts }: WhereTabProps) => {
  const { t } = useTranslation();
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isCourtModalOpen, setIsCourtModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('createGame.selectClub')}</label>
        <button
          type="button"
          onClick={() => setIsClubModalOpen(true)}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-left hover:border-primary-500 transition-colors"
        >
          {state.clubId ? clubs.find((c) => c.id === state.clubId)?.name : t('createGame.selectClub')}
        </button>
      </div>

      {state.clubId && !(game?.entityType === 'BAR' && courts.length === 1) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {game?.entityType === 'BAR' ? t('createGame.selectHall') : t('createGame.selectCourt')}
          </label>
          <button
            type="button"
            onClick={() => setIsCourtModalOpen(true)}
            disabled={isLoadingCourts}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-left hover:border-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingCourts
              ? t('app.loading')
              : state.courtId === 'notBooked' || !state.courtId
                ? t('createGame.notBookedYet')
                : courts.find((c) => c.id === state.courtId)?.name ?? t('createGame.notBookedYet')}
          </button>
        </div>
      )}

      {state.courtId && state.courtId !== 'notBooked' && (
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {game?.entityType === 'BAR' ? t('createGame.hasBookedHall') : t('createGame.hasBookedCourt')}
          </span>
          <ToggleSwitch checked={state.hasBookedCourt} onChange={(v) => onChange({ hasBookedCourt: v })} />
        </div>
      )}

      <ClubModal
        isOpen={isClubModalOpen}
        onClose={() => setIsClubModalOpen(false)}
        clubs={clubs}
        selectedId={state.clubId}
        onSelect={(id) => {
          onChange({ clubId: id, courtId: '', hasBookedCourt: false });
          setIsClubModalOpen(false);
        }}
      />

      <CourtModal
        isOpen={isCourtModalOpen}
        onClose={() => setIsCourtModalOpen(false)}
        courts={courts}
        selectedId={state.courtId || 'notBooked'}
        onSelect={(id) => {
          onChange({ courtId: id === 'notBooked' ? '' : id, ...(id === 'notBooked' ? { hasBookedCourt: false } : {}) });
          setIsCourtModalOpen(false);
        }}
        entityType={game.entityType}
      />
    </div>
  );
};
