import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { CachedImage } from './CachedImage';
import { UrlConstructor } from '@/utils/urlConstructor';
import { UserStats } from '@/api/users';
import { GenderIndicator } from './GenderIndicator';

interface PlayerAvatarViewProps {
  stats: UserStats;
  onBack: () => void;
}

export const PlayerAvatarView: React.FC<PlayerAvatarViewProps> = ({ stats, onBack }) => {
  const { user } = stats;
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] p-6">
      <button
        onClick={onBack}
        className="absolute top-4 left-4 p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors z-10"
      >
        <ArrowLeft size={20} className="text-gray-600 dark:text-gray-300" />
      </button>

      <div className="relative">
        {user.originalAvatar ? (
          <CachedImage
            src={UrlConstructor.constructImageUrl(user.originalAvatar)}
            alt={`${user.firstName} ${user.lastName}`}
            className="max-w-full max-h-[60vh] object-contain shadow-2xl border-8 border-white dark:border-gray-800 rounded-2xl"
          />
        ) : (
          <div className="w-80 h-80 bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800 flex items-center justify-center text-white font-bold text-8xl border-8 border-white dark:border-gray-800 shadow-2xl rounded-2xl">
            {initials}
          </div>
        )}
        
        <GenderIndicator gender={user.gender} layout="big" position="bottom-right" />
      </div>

      <div className="mt-8 text-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {user.firstName}
        </h2>
        {user.lastName && (
          <h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">
            {user.lastName}
          </h3>
        )}
        <div className="mt-4 inline-block bg-yellow-500 dark:bg-yellow-600 text-white px-6 py-2 rounded-full font-bold text-xl shadow-lg">
          Level {user.level.toFixed(1)}
        </div>
      </div>
    </div>
  );
};
