export type { ChatType, ChatListProps } from './chatListTypes';
import { memo } from 'react';
import type { ChatListProps } from './chatListTypes';
import { useChatListModel } from './useChatListModel';
import { ChatListView } from './ChatListView';

const ChatListInner = (props: ChatListProps) => {
  const model = useChatListModel(props);
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ChatListView model={model} />
    </div>
  );
};

export const ChatList = memo(ChatListInner);
