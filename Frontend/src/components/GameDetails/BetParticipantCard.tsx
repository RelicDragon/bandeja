import { BetResultBadge } from './BetResultBadge';
import { BasicUser } from '@/types';

interface BetParticipantCardProps {
  player: BasicUser;
  isWinner: boolean;
  showBadge: boolean;
  onClick?: () => void;
}

const baseClass = `relative inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium border shadow-sm`;
const winClass = 'border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-400';
const loseClass = 'border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-400';
const defaultClass = 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/90 text-gray-900 dark:text-white';

export const BetParticipantCard = ({ player, isWinner, showBadge, onClick }: BetParticipantCardProps) => {
  const variantClass = showBadge && isWinner ? winClass : showBadge && !isWinner ? loseClass : defaultClass;
  const content = (
    <>
      <span className="truncate">{player.firstName || ''} {player.lastName || ''}</span>
      {showBadge && <BetResultBadge isWinner={isWinner} />}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} ${variantClass} cursor-pointer hover:opacity-90 transition-opacity`}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={`${baseClass} ${variantClass}`}>
      {content}
    </div>
  );
};
