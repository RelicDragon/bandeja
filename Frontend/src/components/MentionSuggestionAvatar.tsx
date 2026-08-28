import type { MentionableUser } from '@/utils/mentionableUsers';

type MentionSuggestionAvatarProps = {
  user: MentionableUser;
};

export function MentionSuggestionAvatar({ user }: MentionSuggestionAvatarProps) {
  const initials =
    `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || '?';

  return (
    <div
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-medium text-gray-700 dark:bg-gray-600 dark:text-gray-100"
      aria-hidden
    >
      {initials}
    </div>
  );
}
