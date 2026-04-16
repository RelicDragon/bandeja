import type { Club } from '@/types';

type ClubAvatarProps = {
  club: Pick<Club, 'avatar'>;
  className?: string;
};

export function ClubAvatar({ club, className = '' }: ClubAvatarProps) {
  if (!club.avatar) return null;

  const shell = `relative shrink-0 overflow-hidden rounded-xl shadow-md aspect-[4/3] bg-gray-200 dark:bg-gray-700 ${className}`.trim();

  return (
    <div className={shell}>
      <img src={club.avatar} alt="" className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}
