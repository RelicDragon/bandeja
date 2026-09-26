import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import type { BasicUser, GameParticipant } from '@/types';

interface SubstituteOutListProps {
  players: readonly GameParticipant[];
  onSelect: (user: BasicUser) => void;
}

/** First step: pick the player leaving the court from the seats already filled. */
export const SubstituteOutList = ({ players, onSelect }: SubstituteOutListProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t('gameDetails.substitutePlayerPickOut')}
      </p>
      <div className="max-h-72 space-y-1.5 overflow-y-auto">
        {players.map((participant) => (
          <button
            key={participant.userId}
            type="button"
            onClick={() => onSelect(participant.user)}
            className="flex w-full items-center gap-3 rounded-xl border border-gray-100 px-2.5 py-2 text-start transition hover:border-gray-200 hover:bg-gray-50 dark:border-gray-700/60 dark:hover:border-gray-700 dark:hover:bg-gray-800/60"
          >
            <PlayerAvatar player={participant.user} showName={false} fullHideName extrasmall asDiv />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
              {[participant.user.firstName, participant.user.lastName]
                .filter(Boolean)
                .join(' ')
                .trim()}
            </span>
            <ChevronRight size={16} className="shrink-0 text-gray-400 rtl:rotate-180" />
          </button>
        ))}
      </div>
    </div>
  );
};
