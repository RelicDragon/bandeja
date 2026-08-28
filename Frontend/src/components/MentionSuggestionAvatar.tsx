import type { MentionableUser } from '@/utils/mentionableUsers';
import { PlayerAvatarFace } from '@/components/PlayerAvatarFace';
import { userAvatarTinyUrlFromStandard } from '@/utils/userAvatarTinyUrl';

type MentionSuggestionAvatarProps = {
  user: MentionableUser;
};

export function MentionSuggestionAvatar({ user }: MentionSuggestionAvatarProps) {
  const initials =
    `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || '?';

  return (
    <div className="relative h-6 w-6 shrink-0">
      <PlayerAvatarFace
        avatar={user.avatar}
        tinyUrl={userAvatarTinyUrlFromStandard(user.avatar)}
        initials={initials}
        alt={user.display}
        textClassName="text-[9px] leading-none"
        resetKey={user.id}
      />
    </div>
  );
}
