import { Hash, Package, Users } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { useAuthStore } from '@/store/authStore';
import { getGameChatListEntityVisual } from '@/utils/chatListGameCardDisplay';
import type { ForwardDestination } from '@/services/chat/forwardDestinations';

export function ForwardDestinationAvatar({ dest }: { dest: ForwardDestination }) {
  const userId = useAuthStore((s) => s.user?.id);
  const item = dest.item;

  if (item.type === 'user') {
    const other =
      item.otherUser ??
      (item.data.user1Id === userId ? item.data.user2 : item.data.user1);
    return (
      <div className="shrink-0 flex items-center justify-center">
        <PlayerAvatar
          player={other}
          subscribePresence={false}
          smallLayout
          showName={false}
          fullHideName
          asDiv
        />
      </div>
    );
  }

  if (item.type === 'group' || item.type === 'channel') {
    const ch = item.data;
    const name = ch.name?.trim() || dest.title;
    if (ch.marketItem) {
      if (ch.marketItem.mediaUrls?.length) {
        return (
          <img
            src={ch.marketItem.mediaUrls[0]}
            alt={name}
            className="shrink-0 w-12 h-12 rounded-full object-cover"
          />
        );
      }
      return (
        <div className="shrink-0 w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
          <Package className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
      );
    }
    if (ch.avatar) {
      return (
        <img
          src={ch.avatar}
          alt={name}
          className="shrink-0 w-12 h-12 rounded-full object-cover"
        />
      );
    }
    return (
      <div className="shrink-0 w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
        {ch.isChannel ? (
          <Hash className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        ) : (
          <Users className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        )}
      </div>
    );
  }

  if (item.type === 'game') {
    const visual = getGameChatListEntityVisual(item.data.entityType);
    const { Icon } = visual;
    return (
      <span
        className={`shrink-0 flex h-12 w-12 items-center justify-center rounded-full border ${visual.ringClass} bg-white/80 dark:bg-gray-900/50`}
        aria-hidden
      >
        <Icon className={`w-5 h-5 ${visual.iconClass}`} />
      </span>
    );
  }

  return (
    <div className="shrink-0 w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
      <Users className="w-5 h-5 text-gray-500 dark:text-gray-300" />
    </div>
  );
}
