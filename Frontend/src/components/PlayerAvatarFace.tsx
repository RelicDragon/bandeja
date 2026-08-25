import {
  avatarImageOnError,
  avatarImageSrcToLoad,
  useAvatarImageFallbackState,
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
  const [state, setState] = useAvatarImageFallbackState(`${resetKey ?? ''}\0${avatar ?? ''}\0${tinyUrl ?? ''}`);
  const src = avatarImageSrcToLoad({ avatar, tinyUrl, state });

  return (
    <div className="absolute inset-0 w-full h-full rounded-full overflow-hidden [&>div]:w-full [&>div]:h-full">
      <div
        aria-hidden={Boolean(src)}
        className={`absolute inset-0 w-full h-full rounded-full bg-primary-600 dark:bg-primary-700 flex items-center justify-center text-white font-semibold ${textClassName}`}
      >
        {initials}
      </div>
      {src ? (
        <UserAvatarFallbackImg
          src={src}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setState((current) => avatarImageOnError(current, tinyUrl, src))}
        />
      ) : null}
    </div>
  );
}
