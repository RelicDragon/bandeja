import { PlayerAvatar } from '@/components/PlayerAvatar';
import { BasicUser } from '@/types';

interface CityUserCardProps {
  user: BasicUser;
  onClick: () => void;
}

export const CityUserCard = ({ user, onClick }: CityUserCardProps) => {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unknown';

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      <div className="flex-shrink-0">
        <PlayerAvatar player={user} smallLayout showName={false} fullHideName />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{name}</h3>
      </div>
    </div>
  );
};
