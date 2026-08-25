import { createContext } from 'react';

export type ChatListMotionContextValue = {
  listLoading: boolean;
  networkSettled: boolean;
  motionEnabled: boolean;
};

export const ChatListMotionContext = createContext<ChatListMotionContextValue>({
  listLoading: false,
  networkSettled: true,
  motionEnabled: true,
});
