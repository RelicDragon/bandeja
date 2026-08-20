import { useEffect, useState } from 'react';
import {
  INITIAL_AVATAR_IMAGE_FALLBACK_STATE,
  avatarImageOnError,
  avatarImageSrcToLoad,
} from '@/utils/userAvatarImageFallback';
import { UserAvatarFallbackImg } from './UserAvatarFallbackImg';

type PlayerAvatarFaceProps = {
  avatar?: string | null;
  tinyUrl: string | null;
  initials: string;
  alt: string;
  textClassName: string;
  resetKey?: string;
};

export function PlayerAvatarFace({
  avatar,
  tinyUrl,
  initials,
  alt,
  textClassName,
  resetKey,
}: PlayerAvatarFaceProps) {
  const [state, setState] = useState(INITIAL_AVATAR_IMAGE_FALLBACK_STATE);
  useEffect(() => {
    setState(INITIAL_AVATAR_IMAGE_FALLBACK_STATE);
  }, [avatar, tinyUrl, resetKey]);

  const src = avatarImageSrcToLoad({ avatar, tinyUrl, state });

  if (!src) {
    return (
      <div
        className={`absolute inset-0 w-full h-full rounded-full bg-primary-600 dark:bg-primary-700 flex items-center justify-center text-white font-semibold ${textClassName}`}
      >
        {initials}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 w-full h-full rounded-full overflow-hidden [&>div]:w-full [&>div]:h-full">
      <UserAvatarFallbackImg
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
        onError={() => setState((current) => avatarImageOnError(current, tinyUrl))}
      />
    </div>
  );
}
