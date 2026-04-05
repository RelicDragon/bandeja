export type { ChatType, ChatListProps } from './chatListTypes';
import type { ChatListProps } from './chatListTypes';
import { useChatListModel } from './useChatListModel';
import { ChatListView } from './ChatListView';

export const ChatList = (props: ChatListProps) => {
  const model = useChatListModel(props);
  return <ChatListView model={model} />;
};
