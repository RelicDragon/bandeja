import type { User } from '@/types';
import { SocialLevelIcon } from '@/components/profile/SocialLevelIcon';

type SocialLevelRatingProps = {
  user: User;
  levelDecimals?: number;
  className?: string;
};

export function SocialLevelRating({
  user,
  levelDecimals = 2,
  className = 'bg-amber-500 dark:bg-amber-600 text-white px-3 py-1.5 rounded-full font-bold text-sm shadow-md flex items-center gap-1.5 inline-flex',
}: SocialLevelRatingProps) {
  return (
    <div className="flex justify-center">
      <span className={className}>
        <SocialLevelIcon size={14} foregroundClassName="text-white dark:text-gray-900" />
        <span>{user.socialLevel.toFixed(levelDecimals)}</span>
      </span>
    </div>
  );
}
