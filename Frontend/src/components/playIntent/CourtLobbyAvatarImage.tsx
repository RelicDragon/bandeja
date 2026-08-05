import { useEffect, useState } from 'react';
import { userAvatarTinyUrlFromStandard } from '@/utils/userAvatarTinyUrl';

type Props = {
  /** Standard 256×256 circular avatar URL (CDN `*_avatar.jpg`). */
  avatar?: string | null;
  /** Pre-computed initials text shown when no avatar URL is available. */
  initials: string;
  imgClassName?: string;
  initialsClassName?: string;
  initialsStyle?: React.CSSProperties;
};

/**
 * Avatar image for the court-lobby surfaces that mirrors the tiny→full fallback
 * used by `PlayerAvatar`: prefer the tiny (96×96) variant for bandwidth, but
 * fall back to the full avatar when the tiny object is missing, then to the
 * initials. Other court-lobby callers render the tiny `<img>` directly without
 * an `onError` handler, which shows a broken image whenever a user's tiny
 * object hasn't been generated yet — this component fixes that.
 */
export function CourtLobbyAvatarImage({
  avatar,
  initials,
  imgClassName,
  initialsClassName,
  initialsStyle,
}: Props) {
  const tinyAvatarUrl = userAvatarTinyUrlFromStandard(avatar);
  const [tinyFailed, setTinyFailed] = useState(false);
  useEffect(() => {
    setTinyFailed(false);
  }, [avatar]);

  const src = tinyAvatarUrl && !tinyFailed ? tinyAvatarUrl : avatar ?? null;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        decoding="async"
        draggable={false}
        className={imgClassName}
        onError={() => {
          if (tinyAvatarUrl && !tinyFailed) setTinyFailed(true);
        }}
      />
    );
  }
  return (
    <span className={initialsClassName} style={initialsStyle}>
      {initials}
    </span>
  );
}
