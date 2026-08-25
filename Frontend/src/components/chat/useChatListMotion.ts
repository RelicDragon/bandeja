import { useContext } from 'react';
import { ChatListMotionContext } from './chatListMotionContext';

export function useChatListMotion() {
  return useContext(ChatListMotionContext);
}
