import { useEffect, useState } from 'react';
import type { BasicUser } from '@/types';
import { userAvatarTinyUrlFromStandard } from '@/utils/userAvatarTinyUrl';

type StoryBubbleFaceProps = {
  user: BasicUser;
  thumbnailUrl?: string | null;
  size?: 'rail' | 'header';
};

const SIZE_CLASS = {
  rail: 'h-14 w-14 text-base',
  header: 'h-9 w-9 text-xs',
} as const;

export function StoryBubbleFace({ user, thumbnailUrl, size = 'rail' }: StoryBubbleFaceProps) {
  const sizeClass = SIZE_CLASS[size];
  const tinyUrl = userAvatarTinyUrlFromStandard(user.avatar);
  const [tinyFailed, setTinyFailed] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    setTinyFailed(false);
    setThumbFailed(false);
  }, [user.id, user.avatar, thumbnailUrl]);

  const avatarSrc = tinyUrl && !tinyFailed ? tinyUrl : user.avatar ?? '';
  const useThumb = Boolean(thumbnailUrl?.trim()) && !thumbFailed;
  const src = useThumb ? thumbnailUrl!.trim() : avatarSrc;
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || '?';

  return (
    <div
      className={`${sizeClass} rounded-full overflow-hidden shrink-0 bg-primary-600 dark:bg-primary-700 flex items-center justify-center`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => {
            if (useThumb) setThumbFailed(true);
            else if (tinyUrl && !tinyFailed) setTinyFailed(true);
          }}
        />
      ) : (
        <span className="text-white font-semibold">{initials}</span>
      )}
    </div>
  );
}
