import { memo } from 'react';
import { Users } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { CommonChatItem } from '@/api/commonChats';
import { Loading } from '@/components/Loading';
import { PlayerCardCommonChatListItem } from '@/components/player/PlayerCardCommonChatListItem';

interface PlayerCardCommonGroupsProps {
  chats: CommonChatItem[];
  loading: boolean;
  t: TFunction;
  onChatClick: (chat: CommonChatItem) => void;
}

const PlayerCardCommonGroupsComponent = ({
  chats,
  loading,
  t,
  onChatClick,
}: PlayerCardCommonGroupsProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loading />
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-gray-500 dark:text-gray-400">
        <Users size={32} className="opacity-50" />
        <p className="text-sm">{t('playerCard.noCommonGroups')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      {chats.map((chat) => (
        <PlayerCardCommonChatListItem
          key={`${chat.kind}-${chat.id}`}
          item={chat}
          onClick={() => onChatClick(chat)}
        />
      ))}
    </div>
  );
};

export const PlayerCardCommonGroups = memo(PlayerCardCommonGroupsComponent);
