import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Users } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import type { BasicUser, Game } from '@/types';
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
 * once results start — see `docs/product/constraints.md`.
 */
export const ResultsRosterCard = ({ game, canEdit, onGameUpdate }: ResultsRosterCardProps) => {
  const { t } = useTranslation();
  const [outUser, setOutUser] = useState<BasicUser | null>(null);

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
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-1 flex items-center gap-2">
        <Users size={18} className="text-primary-600 dark:text-primary-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('gameDetails.resultsRosterTitle')}
        </h3>
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        {t('gameDetails.resultsRosterHint')}
      </p>

      <div className="space-y-1.5">
        {playing.map((participant) => (
          <div
            key={participant.userId}
            className="flex items-center gap-3 rounded-xl border border-gray-100 px-2.5 py-2 dark:border-gray-700/60"
          >
            <PlayerAvatar player={participant.user} showName={false} fullHideName extrasmall />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
              {[participant.user.firstName, participant.user.lastName]
                .filter(Boolean)
                .join(' ')
                .trim()}
            </span>
            <button
              type="button"
              onClick={() => setOutUser(participant.user)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:border-primary-300 hover:bg-primary-50/60 dark:border-gray-600 dark:text-gray-200 dark:hover:border-primary-600 dark:hover:bg-primary-900/20"
            >
              <ArrowLeftRight size={14} />
              {t('gameDetails.substitutePlayerAction')}
            </button>
          </div>
        ))}
      </div>

      {outUser ? (
        <SubstitutePlayerModal
          game={game}
          outUser={outUser}
          onClose={() => setOutUser(null)}
          onSubstituted={onGameUpdate}
        />
      ) : null}
    </div>
  );
};
