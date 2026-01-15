import { PlayerAvatar } from '@/components/PlayerAvatar';
import { BetResultBadge } from './BetResultBadge';
import { BasicUser } from '@/types';

interface BetParticipantCardProps {
  player: BasicUser;
  isWinner: boolean;
  showBadge: boolean;
}

export const BetParticipantCard = ({ player, isWinner, showBadge }: BetParticipantCardProps) => {
  return (
    <div className={`relative flex items-center gap-2 rounded-full px-2 py-1 ${
      showBadge && isWinner
        ? 'border-2 border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-900/30'
        : showBadge && !isWinner
        ? 'border-2 border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/30'
        : 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
    }`}>
      <PlayerAvatar player={player} fullHideName={true} extrasmall />
      <span className={`text-sm font-medium ${
        showBadge && isWinner
          ? 'text-green-800 dark:text-green-400'
          : showBadge && !isWinner
          ? 'text-red-800 dark:text-red-400'
          : 'text-gray-900 dark:text-white'
      }`}>
        {player.firstName || ''} {player.lastName || ''}
      </span>
      {showBadge && (
        <BetResultBadge isWinner={isWinner} />
      )}
    </div>
  );
};
