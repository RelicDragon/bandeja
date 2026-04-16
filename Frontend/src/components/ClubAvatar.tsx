import type { Club } from '@/types';
import { teamNameInitials } from '@/utils/teamAvatarText';

type ClubAvatarProps = {
  club: Pick<Club, 'name' | 'avatar'>;
  className?: string;
};

export function ClubAvatar({ club, className = '' }: ClubAvatarProps) {
  const initials = teamNameInitials(club.name);
  const shell = `relative shrink-0 overflow-hidden rounded-xl shadow-md aspect-[4/3] bg-gray-200 dark:bg-gray-700 ${className}`.trim();

  if (club.avatar) {
    return (
      <div className={shell}>
        <img src={club.avatar} alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className={`${shell} flex items-center justify-center text-gray-600 dark:text-gray-300 font-semibold text-xs`}>
      {initials}
    </div>
  );
}
