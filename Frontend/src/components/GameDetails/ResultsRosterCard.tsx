import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, ChevronRight } from 'lucide-react';
import type { Game } from '@/types';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { isGameArchived } from '@shared/gameMutationLock';
import { SubstitutePlayerModal } from './substitute/SubstitutePlayerModal';

interface ResultsRosterCardProps {
  game: Game;
  canEdit: boolean;
  onGameUpdate: () => void;
}

/**
 * While results are in progress the normal participants section is hidden, so this is the
 * only place an owner can act on the roster. Substitution is the one roster change allowed
 * once results start — see `docs/product/constraints.md`. It is rarely needed, so the page
 * only carries a single row and the whole flow lives in the modal.
 */
export const ResultsRosterCard = ({ game, canEdit, onGameUpdate }: ResultsRosterCardProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // The trainer holds a role rather than a seat, so they are changed through game settings.
  const playing = useMemo(
    () =>
      game.participants.filter(
        (participant) => isParticipantPlaying(participant) && participant.userId !== game.trainerId,
      ),
    [game.participants, game.trainerId],
  );

  // League rosters carry standings aliases and are changed from the league team instead.
  const isLeague = game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON';
  const visible =
    canEdit &&
    !isLeague &&
    game.resultsStatus === 'IN_PROGRESS' &&
    !isGameArchived(game) &&
    playing.length > 0;

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-start shadow-sm transition hover:border-primary-300 active:scale-[0.99] dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-600"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
          <ArrowLeftRight size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">
            {t('gameDetails.substitutePlayerTitle')}
          </span>
          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
            {t('gameDetails.substitutePlayerCardHint')}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-gray-400 rtl:rotate-180" />
      </button>

      <SubstitutePlayerModal
        open={open}
        game={game}
        players={playing}
        onClose={() => setOpen(false)}
        onSubstituted={onGameUpdate}
      />
    </>
  );
};
