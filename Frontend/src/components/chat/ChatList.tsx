export type { ChatType, ChatListProps } from './chatListTypes';
import { memo } from 'react';
import type { ChatListProps } from './chatListTypes';
import { useChatListModel } from './useChatListModel';
import { ChatListView } from './ChatListView';

const ChatListInner = (props: ChatListProps) => {
  const model = useChatListModel(props);
  return <ChatListView model={model} />;
};

export const ChatList = memo(ChatListInner);
