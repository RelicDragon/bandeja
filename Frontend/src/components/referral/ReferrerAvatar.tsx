import { useState } from 'react';
import { User } from 'lucide-react';
import { UserAvatarFallbackImg } from '@/components/UserAvatarFallbackImg';

export interface ReferrerAvatarProps {
  firstName: string | null;
  avatar: string | null;
  /** Rendered size in px. 28 for inline chips, 44 for the invite illustration. */
  size?: number;
  className?: string;
}

/**
 * PRD 351 — a plain avatar for someone we only know a first name and a picture
 * of.
 *
 * Deliberately *not* `PlayerAvatar`: that component needs a full `BasicUser`,
 * subscribes to presence and opens the player-card modal. The referral
 * surfaces resolve a referrer through the public endpoint, which by design
 * returns a first name and an avatar url and nothing else — there is no user
 * id to open a card for, and adding one would leak an account to a guest.
 */
export const ReferrerAvatar = ({
  firstName,
  avatar,
  size = 28,
  className = '',
}: ReferrerAvatarProps) => {
  const [failed, setFailed] = useState(false);
  const initial = firstName?.trim()?.charAt(0).toUpperCase() ?? '';
  const dimension = { width: size, height: size };

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 ${className}`}
      style={dimension}
      aria-hidden
    >
      {avatar && !failed ? (
        <UserAvatarFallbackImg
          src={avatar}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : initial ? (
        <span className="text-xs font-semibold leading-none">{initial}</span>
      ) : (
        <User size={Math.round(size * 0.55)} strokeWidth={2} />
      )}
    </span>
  );
};
