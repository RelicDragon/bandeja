import type { ReactNode } from 'react';
import { Bot, User } from 'lucide-react';
import type { ChatMessage } from '@/api/chat';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { BasicUser } from '@/types';
import { isThreadSearchSystemMessage } from './threadSearchPreview';

type ThreadSearchResultAvatarProps = {
  message: ChatMessage;
  currentUserId: string | undefined;
  currentUser: BasicUser | null | undefined;
};

function PlaceholderAvatar({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
      {children}
    </span>
  );
}

export function ThreadSearchResultAvatar({
  message,
  currentUserId,
  currentUser,
}: ThreadSearchResultAvatarProps) {
  if (isThreadSearchSystemMessage(message)) {
    return (
      <PlaceholderAvatar>
        <Bot size={10} className="text-gray-500 dark:text-gray-400" aria-hidden />
      </PlaceholderAvatar>
    );
  }

  const isSelf = !!(message.senderId && currentUserId && message.senderId === currentUserId);
  const player = isSelf ? currentUser : message.sender;

  if (!player) {
    return (
      <PlaceholderAvatar>
        <User size={10} className="text-gray-500 dark:text-gray-400" aria-hidden />
      </PlaceholderAvatar>
    );
  }

  return (
    <span className="inline-flex leading-none">
      <PlayerAvatar
        player={player}
        subscribePresence={false}
        isCurrentUser={isSelf}
        superTiny
        fullHideName
        showName={false}
        asDiv
      />
    </span>
  );
}
