import { ChatType } from '@/types';

export const normalizeChatType = (chatType: ChatType): ChatType => {
  return chatType === 'PRIVATE' ? 'PUBLIC' : chatType;
};
